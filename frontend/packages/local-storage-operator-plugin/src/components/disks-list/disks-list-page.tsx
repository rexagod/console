import * as React from 'react';
import { useTranslation } from 'react-i18next';
import * as _ from 'lodash';
import * as cx from 'classnames';
import { Button, EmptyState, EmptyStateVariant, Alert } from '@patternfly/react-core';
import { sortable } from '@patternfly/react-table';
import {
  Table,
  TableProps,
  TableRow,
  TableData,
  RowFunction,
  MultiListPage,
} from '@console/internal/components/factory';
import {
  FirehoseResult,
  humanizeBinaryBytes,
  Kebab,
  Loading,
  LoadingInline,
} from '@console/internal/components/utils';
import { referenceForModel, NodeKind } from '@console/internal/module/k8s';
import { RowFilter } from '@console/internal/components/filter-toolbar';
import { useK8sWatchResource } from '@console/internal/components/utils/k8s-watch-hook';
import { SubscriptionKind, SubscriptionModel } from '@console/operator-lifecycle-manager';
import { getNamespace, getNodeRole } from '@console/shared/';
import { LocalVolumeDiscoveryResult } from '../../models';
import { LABEL_SELECTOR } from '../../constants/disks-list';
import { DiskMetadata, DiskStates, LocalVolumeDiscoveryResultKind } from './types';
import {
  updateLocalVolumeDiscovery,
  createLocalVolumeDiscovery,
} from '../local-volume-discovery/request';
import { errorMessage } from '@console/internal-integration-tests/views/crud.view';

export const tableColumnClasses = [
  '',
  '',
  cx('pf-m-hidden', 'pf-m-visible-on-xl'),
  cx('pf-m-hidden', 'pf-m-visible-on-2xl'),
  cx('pf-m-hidden', 'pf-m-visible-on-lg'),
  cx('pf-m-hidden', 'pf-m-visible-on-xl'),
  Kebab.columnClass,
];

const diskRow: RowFunction<DiskMetadata> = ({ obj, index, key, style }) => (
  <TableRow id={obj.deviceID} index={index} trKey={key} style={style}>
    <TableData className={tableColumnClasses[0]}>{obj.path}</TableData>
    <TableData className={tableColumnClasses[1]}>{obj.status.state}</TableData>
    <TableData className={tableColumnClasses[2]}>{obj.type || '-'}</TableData>
    <TableData className={cx(tableColumnClasses[3], 'co-break-word')}>{obj.model || '-'}</TableData>
    <TableData className={tableColumnClasses[4]}>
      {humanizeBinaryBytes(obj.size).string || '-'}
    </TableData>
    <TableData className={tableColumnClasses[5]}>{obj.fstype || '-'}</TableData>
  </TableRow>
);

const DisksList: React.FC<TableProps> = (props) => {
  const { t } = useTranslation();

  const diskHeader = () => [
    {
      title: t('lso-plugin~Name'),
      sortField: 'path',
      transforms: [sortable],
      props: { className: tableColumnClasses[0] },
    },
    {
      title: t('lso-plugin~Disk State'),
      sortField: 'status.state',
      transforms: [sortable],
      props: { className: tableColumnClasses[1] },
    },
    {
      title: t('lso-plugin~Type'),
      sortField: 'type',
      transforms: [sortable],
      props: { className: tableColumnClasses[2] },
    },
    {
      title: t('lso-plugin~Model'),
      sortField: 'model',
      transforms: [sortable],
      props: { className: tableColumnClasses[3] },
    },
    {
      title: t('lso-plugin~Capacity'),
      sortField: 'size',
      transforms: [sortable],
      props: { className: tableColumnClasses[4] },
    },
    {
      title: t('lso-plugin~Filesystem'),
      sortField: 'fstype',
      transforms: [sortable],
      props: { className: tableColumnClasses[5] },
    },
  ];

  return (
    <Table
      {...props}
      aria-label={t('lso-plugin~Disks List')}
      Header={diskHeader}
      Row={diskRow}
      NoDataEmptyMsg={props.customData.EmptyMsg} // when no unfilteredData
      virtualize
    />
  );
};

export const NodesDisksListPage: React.FC<NodesDisksListPageProps> = ({
  obj,
  ListComponent = undefined,
}) => {
  const { t } = useTranslation();

  const [subscription, subscriptionLoaded] = useK8sWatchResource<SubscriptionKind[]>({
    kind: referenceForModel(SubscriptionModel),
    fieldSelector: 'metadata.name=local-storage-operator',
    isList: true,
  });

  const operatorNs = getNamespace(subscription[0]);
  const csvName = subscription?.[0]?.status?.installedCSV;
  const nodeName = obj.metadata.name;
  const nodeNameByHostnameLabel = obj.metadata?.labels?.['kubernetes.io/hostname'];
  const nodeRole = getNodeRole(obj);
  const propName = `lvdr-${nodeName}`;
  const [helpMessage, setError] = React.useState('');
  const [inProgress, setProgress] = React.useState(false);

  const makeLocalVolumeDiscoverRequest = async (node: string, ns: string) => {
    setProgress(true);
    try {
      await updateLocalVolumeDiscovery([node], ns, setError);
    } catch (error) {
      if (error?.response?.status === 404) {
        try {
          await createLocalVolumeDiscovery([node], ns, setError);
        } catch (createError) {
          setError(createError.message);
        }
      } else {
        setError(error.message);
      }
    } finally {
      setProgress(false);
    }
  };

  const EmptyMsg = () => (
    <EmptyState variant={EmptyStateVariant.large}>
      {!subscriptionLoaded ? (
        <LoadingInline />
      ) : (
        <>
          <p>{t('lso-plugin~Disks Not Found')}</p>
          {csvName && operatorNs && nodeRole !== 'master' && (
            <Button
              onClick={() => {
                makeLocalVolumeDiscoverRequest(nodeNameByHostnameLabel, operatorNs);
              }}
              variant="primary"
              id="yaml-create"
              data-test="yaml-create"
            >
              {t('lso-plugin~Discover Disks')}
            </Button>
          )}
          {inProgress && <Loading />}
        </>
      )}
    </EmptyState>
  );

  const diskFilters: RowFilter[] = [
    {
      type: 'disk-state',
      filterGroupName: t('lso-plugin~Disk State'),
      reducer: (disk: DiskMetadata) => {
        return disk?.status?.state;
      },
      items: [
        { id: DiskStates.Available, title: t('lso-plugin~Available') },
        { id: DiskStates.NotAvailable, title: t('lso-plugin~NotAvailable') },
        { id: DiskStates.Unknown, title: t('lso-plugin~Unknown') },
      ],
      filter: (
        states: { all: (keyof typeof DiskStates)[]; selected: Set<keyof typeof DiskStates> },
        disk: DiskMetadata,
      ) => {
        if (!states || !states.selected || _.isEmpty(states.selected)) {
          return true;
        }
        const diskState = disk?.status.state;
        return states.selected.has(diskState) || !_.includes(states.all, diskState);
      },
    },
  ];

  const ErrorMessage = ({ message }) => {
    return (
      <Alert
        isInline
        className="co-alert co-alert--scrollable"
        variant="danger"
        title={t('public~An error occurred')}
      >
        <div className="co-pre-line">{message}</div>
      </Alert>
    );
  };

  return (
    <>
      <MultiListPage
        helpText={helpMessage}
        canCreate={false}
        title={t('lso-plugin~Disks')}
        hideLabelFilter
        textFilter="node-disk-name"
        rowFilters={diskFilters}
        flatten={(resource: FirehoseResult<LocalVolumeDiscoveryResultKind>) =>
          resource[propName]?.data[0]?.status?.discoveredDevices ?? []
        }
        ListComponent={ListComponent ?? DisksList}
        resources={[
          {
            kind: referenceForModel(LocalVolumeDiscoveryResult),
            prop: propName,
            selector: { [LABEL_SELECTOR]: nodeName },
          },
        ]}
        customData={{ node: nodeName, EmptyMsg }}
      />
      {errorMessage && <ErrorMessage message={errorMessage} />}
    </>
  );
};

export type NodesDisksListPageProps = {
  obj: NodeKind;
  ListComponent: React.ComponentType;
};
