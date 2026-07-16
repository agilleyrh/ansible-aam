# OpenShift Operator scaffold

This directory scaffolds an OpenShift Operator for deploying Advanced Automation Manager as a managed operand on OpenShift.

It is intentionally lean: CustomResourceDefinition, sample `AAMInstance`, RBAC, and Deployment manifests that an Operator SDK / OLM package can wrap.

## Install the CRD

```bash
oc apply -f config/crd/aam.openshift.io_aaminstances.yaml
```

## Deploy a sample instance

```bash
oc new-project aam-system
oc apply -f config/samples/aam_v1alpha1_aaminstance.yaml
oc apply -f config/rbac/
oc apply -f config/manager/manager.yaml
```

Replace image references in `config/manager/manager.yaml` and the sample CR with your registry paths.

## Operand model

`AAMInstance` describes a hub deployment:

- API, worker, and scheduler replicas
- PostgreSQL / Redis (bundled or external)
- UI route hostname
- trusted gateway / CORS settings

The operator reconciler (to be generated with Operator SDK) watches `AAMInstance` and ensures Deployment, Service, Route/Ingress, Secret, and PVC resources match the desired state.

## Next packaging steps

1. `operator-sdk init --domain openshift.io --repo github.com/agilleyrh/ansible-aam`
2. `operator-sdk create api --group aam --version v1alpha1 --kind AAMInstance --resource --controller`
3. Import the CRD/sample schemas from this scaffold
4. Bundle with OLM (`operator-sdk generate bundle`) for OperatorHub
