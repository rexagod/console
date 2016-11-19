import React from 'react';

import { kubectlConfigSvc } from '../../module/service/kubectl-config';
import { createModalLauncher, ModalTitle, ModalBody, ModalSubmitFooter } from '../factory/modal';
import { PromiseComponent } from '../utils';
import { angulars } from '../react-wrapper';

const steps = {
  GET_VERIFICATION_CODE: 1,
  VERIFY_CODE: 2,
  DOWNLOAD_CONFIGURATION: 3
};

class KubectlConfigModal extends PromiseComponent {
  constructor(props) {
    super(props);

    this.state = {
      step: 1,
      configuration: null,
      verificationCode: null,
      kubectlLinuxUrl: null,
      kubectlMacUrl: null,
      kubectlWinUrl: null
    };

    this._isMounted = false;

    this._updateCode = this._updateCode.bind(this);
    this._verifyCode = this._verifyCode.bind(this);
    this._getVerificationCode = this._getVerificationCode.bind(this);
    this._downloadConfiguration = () => kubectlConfigSvc.downloadConfiguration(this.state.configuration);
  }

  componentDidMount() {
    this._isMounted = true;
    this._setKubectlUrls();
  }

  componentWillUnmount() {
    this._isMounted = false;
  }

  _getVerificationCode(event) {
    event.preventDefault();

    kubectlConfigSvc.getVerificationCode();
    this.setState({
      step: steps.VERIFY_CODE
    });
  }

  _verifyCode(event) {
    event.preventDefault();

    this._setRequestPromise(
      kubectlConfigSvc.getConfiguration(this.state.verificationCode)
    ).then((configuration) => {
      this.setState({
        step: steps.DOWNLOAD_CONFIGURATION,
        configuration
      });
    });
  }

  _updateCode(event) {
    this.setState({
      verificationCode: event.target.value
    });
  }

  _setKubectlUrls() {
    angulars.statusSvc.kubernetesVersion()
      .then((resp) => {
        if (!this._isMounted) {
          return;
        }

        const k8sVersion = resp.gitVersion.split('+')[0];
        const prefix = `https://storage.googleapis.com/kubernetes-release/release/${k8sVersion}`;
        const postfix = '/amd64/kubectl';

        this.setState({
          kubectlMacUrl: `${prefix}/bin/darwin${postfix}`,
          kubectlLinuxUrl: `${prefix}/bin/linux${postfix}`,
          kubectlWinUrl: `${prefix}/bin/windows${postfix}.exe`
        });
      });
  }

  render() {
    return <div className="co-p-kubectl-config">

      {/*step 1: get verification code*/}
      { this.state.step === steps.GET_VERIFICATION_CODE && <form onSubmit={this._getVerificationCode} name="get-verification-code">
        <ModalTitle>Set Up kubectl</ModalTitle>
        <ModalBody>
          <p>Tectonic will generate a kubectl configuration file for you. First, we need to generate a set of offline credentials.</p>
          <p>Your identity will be verified before generation.</p>
        </ModalBody>
        <ModalSubmitFooter submitText="Verify Identity" cancel={this.props.cancel} />
      </form> }

      {/*step 2: verify code*/}
      { this.state.step === steps.VERIFY_CODE && <form onSubmit={this._verifyCode} name="enter-verification-code">
        <ModalTitle>Download kubectl Configuration</ModalTitle>
        <ModalBody>
          <p>Enter the code from the previous screen to generate your credentials:</p>
          <div className="row co-m-form-row">
            <div className="col-sm-6">
              <input type="text" className="form-control" placeholder="Verification Code" required={true} onChange={this._updateCode} />
            </div>
          </div>
        </ModalBody>
        <ModalSubmitFooter promise={this.requestPromise} errorFormatter="k8sApi" submitText="Generate Configuration" cancel={this.props.cancel} />
      </form> }

      {/*step 3: download configuration*/}
      { this.state.step === steps.DOWNLOAD_CONFIGURATION && <div>
        <ModalTitle>Download kubectl Configuration</ModalTitle>
        <ModalBody>
          <p>
            <button type="button" className="btn btn-block btn-link co-btn--download" onClick={this._downloadConfiguration}>
              <i className="fa fa-download"></i>&nbsp;Download Configuration
            </button>
          </p>
          <p>1. Download the kubectl binary for <a href={this.state.kubectlMacUrl} target="_blank">Mac</a> or <a href={this.state.kubectlLinuxUrl} target="_blank">Linux</a> or <a href={this.state.kubectlWinUrl} target="_blank">Windows</a></p>
          <p>2. Place the configuration file at <code>~/.kube/config</code></p>
          <p>3. Done! Interact with the cluster, i.e. <code>kubectl get namespaces</code></p>
        </ModalBody>
        <ModalFooter>
          <button type="button" className="btn btn-primary" onClick={this.props.close}>I'm Done</button>
        </ModalFooter>
      </div> }

    </div>;
  }
}

export const kubectlConfigModal = createModalLauncher(KubectlConfigModal);
