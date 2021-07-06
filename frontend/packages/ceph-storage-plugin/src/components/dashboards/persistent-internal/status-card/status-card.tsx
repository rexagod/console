import * as React from 'react';
import { useTranslation } from 'react-i18next';
import * as _ from 'lodash';
import { Gallery, GalleryItem, Split, SplitItem } from '@patternfly/react-core';
import AlertsBody from '@console/shared/src/components/dashboard/status-card/AlertsBody';
import AlertItem from '@console/shared/src/components/dashboard/status-card/AlertItem';
import { alertURL } from '@console/internal/components/monitoring/utils';
import DashboardCard from '@console/shared/src/components/dashboard/dashboard-card/DashboardCard';
import DashboardCardBody from '@console/shared/src/components/dashboard/dashboard-card/DashboardCardBody';
import DashboardCardHeader from '@console/shared/src/components/dashboard/dashboard-card/DashboardCardHeader';
import DashboardCardTitle from '@console/shared/src/components/dashboard/dashboard-card/DashboardCardTitle';
import HealthBody from '@console/shared/src/components/dashboard/status-card/HealthBody';
import HealthItem from '@console/shared/src/components/dashboard/status-card/HealthItem';
import { PrometheusResponse } from '@console/internal/components/graphs';
import {
  withDashboardResources,
  DashboardItemProps,
} from '@console/internal/components/dashboard/with-dashboard-resources';
import { useK8sWatchResource } from '@console/internal/components/utils/k8s-watch-hook';
import { K8sResourceKind } from '@console/internal/module/k8s';
import {
  HealthState,
  healthStateMapping,
} from '@console/shared/src/components/dashboard/status-card/states';
import { getCephHealthState, getDataResiliencyState } from './utils';
import { CephHealthCheck } from './types';
import { whitelistedHealthChecksRef } from './whitelistedHealthChecks';
import { DATA_RESILIENCY_QUERY, StorageDashboardQuery } from '../../../../queries';
import { cephClusterResource } from '../../../../resources';
import { filterCephAlerts } from '../../../../selectors';
import './healthchecks.scss';

const resiliencyProgressQuery = DATA_RESILIENCY_QUERY[StorageDashboardQuery.RESILIENCY_PROGRESS];

export const CephAlerts = withDashboardResources(
  ({ watchAlerts, stopWatchAlerts, notificationAlerts }) => {
    React.useEffect(() => {
      watchAlerts();
      return () => {
        stopWatchAlerts();
      };
    }, [watchAlerts, stopWatchAlerts]);

    const { data, loaded, loadError } = notificationAlerts || {};
    const alerts = filterCephAlerts(data);

    return (
      <AlertsBody error={!_.isEmpty(loadError)}>
        {loaded &&
          alerts.length > 0 &&
          alerts.map((alert) => <AlertItem key={alertURL(alert, alert.rule.id)} alert={alert} />)}
      </AlertsBody>
    );
  },
);

export const StatusCard: React.FC<DashboardItemProps> = ({
  watchPrometheus,
  stopWatchPrometheusQuery,
  prometheusResults,
}) => {
  const { t } = useTranslation();
  const [data, loaded, loadError] = useK8sWatchResource<K8sResourceKind[]>(cephClusterResource);

  React.useEffect(() => {
    watchPrometheus(resiliencyProgressQuery);
    return () => {
      stopWatchPrometheusQuery(resiliencyProgressQuery);
    };
  }, [watchPrometheus, stopWatchPrometheusQuery]);

  const resiliencyProgress = prometheusResults.getIn([
    resiliencyProgressQuery,
    'data',
  ]) as PrometheusResponse;
  const resiliencyProgressError = prometheusResults.getIn([resiliencyProgressQuery, 'loadError']);

  const cephHealthState = getCephHealthState({ ceph: { data, loaded, loadError } }, t);
  const dataResiliencyState = getDataResiliencyState(
    [{ response: resiliencyProgress, error: resiliencyProgressError }],
    t,
  );

  const healthChecksGetterOrPresent = (checkPresence: boolean = false) => {
    const cephDetails = data?.[0]?.status?.ceph?.details;
    const pattern = /[A-Z]+_*|error/g;
    const healthChecks: CephHealthCheck[] = [];
    for (const key in cephDetails) {
      if (cephDetails.hasOwnProperty(key) && pattern.test(key)) {
        if (checkPresence) {
          return true;
        }
        const healthCheckObject: CephHealthCheck = {
          details: cephDetails[key].message,
          troubleshootLink: whitelistedHealthChecksRef[key] ?? null,
        };
        healthChecks.push(healthCheckObject);
      }
    }
    return checkPresence ? false : healthChecks;
  };

  const CephHealthChecks: React.FC = () => {
    const healthChecks = healthChecksGetterOrPresent();
    return (
      <div
        className={
          (healthChecks as CephHealthCheck[]).length > 3 ? 'healthchecks-scrollable' : null
        }
      >
        {(healthChecks as CephHealthCheck[]).map((healthCheck: CephHealthCheck) => (
          <Split hasGutter key={healthCheck.details} className="align-troubleshoot">
            <SplitItem>
              <div className="co-dashboard-icon">
                {
                  (
                    healthStateMapping[cephHealthState.state] ||
                    healthStateMapping[HealthState.UNKNOWN]
                  ).icon
                }
              </div>
            </SplitItem>
            <SplitItem isFilled>
              <strong>{healthCheck.details}</strong>
            </SplitItem>
            {!!healthCheck.troubleshootLink && (
              <SplitItem>
                <a href={healthCheck.troubleshootLink}>{t('ceph-storage-plugin~Troubleshoot')}</a>
                &nbsp;
              </SplitItem>
            )}
          </Split>
        ))}
      </div>
    );
  };

  return (
    <DashboardCard gradient>
      <DashboardCardHeader>
        <DashboardCardTitle>{t('ceph-storage-plugin~Status')}</DashboardCardTitle>
      </DashboardCardHeader>
      <DashboardCardBody>
        <HealthBody>
          <Gallery className="co-overview-status__health" hasGutter>
            <GalleryItem>
              <HealthItem
                title={t('ceph-storage-plugin~Storage Cluster')}
                state={cephHealthState.state}
                details={cephHealthState.message}
                popupTitle={
                  healthChecksGetterOrPresent(true)
                    ? t('ceph-storage-plugin~Active health checks')
                    : null
                }
              >
                {healthChecksGetterOrPresent(true) ? <CephHealthChecks /> : null}
              </HealthItem>
            </GalleryItem>
            <GalleryItem>
              <HealthItem
                title={t('ceph-storage-plugin~Data Resiliency')}
                state={dataResiliencyState.state}
                details={dataResiliencyState.message}
              />
            </GalleryItem>
          </Gallery>
        </HealthBody>
        <CephAlerts />
      </DashboardCardBody>
    </DashboardCard>
  );
};

export default withDashboardResources(StatusCard);
