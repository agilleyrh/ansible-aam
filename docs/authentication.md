# Authentication and access control

AAM signs operators in itself. The model follows Red Hat Ansible Automation Orchestrator: local accounts plus external identity providers, system roles for the hub, and environment roles that delegate administration onto one registered estate.

The console requires a session. The lab no longer injects an identity header.

## Sign in

Open the UI. The sign-in page offers:

- **Local username and password.** Always available for the built-in administrator. Available for every local account unless local login is disabled.
- **OpenID Connect.** One button per enabled OIDC provider. The browser is sent to the provider and returns to AAM with a session cookie.
- **LDAP or Active Directory.** A username and password form for each enabled directory provider.

On the CRC lab the first account is:

| Field | Value |
| --- | --- |
| Username | `admin` |
| Password | `ChangeMe-Admin1!` |

That password is the lab default in Secret `aam`, key `bootstrap-admin-password`. Change it from **Access** after the first sign-in. The API sets the password only when it creates the built-in user. Later restarts do not reset it.

A local password must be at least 14 characters and include at least three of: digits, uppercase letters, lowercase letters, and symbols.

## Roles

Access is deny-by-default. A person receives roles through group membership and through explicit role assignments.

### System roles

These apply to the whole hub. Built-in groups carry them and those bindings cannot be removed.

| Role | Built-in group | What it allows |
| --- | --- | --- |
| `admin` | `admins` | Platform administrator. Users, groups, identity providers, settings, policies, and every environment. |
| `auditor` | `auditors` | Read every environment. Cannot change them or manage access. |
| `user` | `users` | Create environments. The creator becomes `environment-admin` on each environment they create. |
| `authenticated` | `authenticated` | Baseline for every signed-in account. Membership is added automatically. |

`admin` is the system-wide administrator. It is not granted per environment.

### Environment roles

These delegate the same idea onto one registered AAP or Automation Orchestrator environment, the way Orchestrator scopes a project role onto one project.

| Role | What it allows on that environment |
| --- | --- |
| `environment-admin` | Update, sync, delete, and assign environment roles for that estate. |
| `environment-user` | View the estate and run operational actions such as sync and remote actions. |
| `environment-auditor` | Read the estate. |

A system administrator can do all of those on every environment. A system auditor can read every environment and cannot operate them. Everyone else sees only environments where they hold an environment role. Overview, monitoring, jobs, activity, search, topology, and policy results follow that same filter.

Fleet policy create, push, and remediate stay with the system administrator.

## Day-to-day administration

System administrators use **Access**.

### Create a local user

1. Open **Access**.
2. Enter a username, optional email, and a password that meets the rule above.
3. Create the user. They join `users` and `authenticated`, so they can create environments and administer the ones they create.

The built-in administrator cannot be disabled from this form.

### Delegate an environment

1. Open **Access**.
2. Choose scope **Environment**, then `environment-admin`, `environment-user`, or `environment-auditor`.
3. Pick the environment and a user or group.
4. Assign the role.

An `environment-admin` can assign and remove environment roles for estates they administer. They cannot create users, change system roles, or edit identity providers.

Removing an environment also removes role assignments for that environment.

### Turn local login off

Set `AAM_LOCAL_LOGIN_ENABLED=false` after at least one external provider is working. Other local accounts can no longer use a password. The built-in administrator still can, so the hub is not locked out of a password sign-in.

## Identity providers

Create providers on **Access**. The configuration field is JSON. The secret field is stored encrypted with `AAM_SECRET_KEY` and is the OIDC client secret or the directory bind password.

A provider does nothing until **Enabled** is checked.

### Who is allowed in

External accounts are rejected unless a group mapping matches, or **Allow every authenticated account into the users group** is checked.

On each successful external login, AAM replaces that account's group membership with the mapped groups plus `authenticated`. The built-in administrator's existing memberships are left in place.

`group_mappings` entries look like:

```json
{ "idp_group": "name-or-dn-from-the-provider", "group": "admins" }
```

`group` must be an AAM group name: `admins`, `auditors`, `users`, or `authenticated`.

### OpenID Connect

Use this for Keycloak, Red Hat SSO, Entra ID, and any other OIDC authorization server. LDAP or Active Directory fronted by Keycloak is also configured here rather than as a native directory.

Set `AAM_PUBLIC_URL` to the origin users type in the browser, with no trailing path. The redirect URI registered at the provider must be:

```text
${AAM_PUBLIC_URL}/api/v1/auth/oidc/callback
```

CRC lab example: `https://aam.apps.crc.testing/api/v1/auth/oidc/callback`.

Example configuration:

```json
{
  "issuer_url": "https://sso.example.com/realms/aap",
  "client_id": "aam",
  "scope": "openid profile email groups",
  "groups_claim": "groups",
  "group_mappings": [
    { "idp_group": "aam-admins", "group": "admins" },
    { "idp_group": "platform-users", "group": "users" }
  ]
}
```

Put the client secret in the secret field. AAM uses authorization code with PKCE (`S256`), reads the provider's discovery document, and takes the username from `preferred_username`, then `email`, then `sub`. Group names come from the claim named by `groups_claim` (default `groups`) on the userinfo response.

### LDAP

```json
{
  "url": "ldaps://ldap.example.com",
  "bind_dn": "cn=aam,ou=services,dc=example,dc=com",
  "user_base_dn": "ou=people,dc=example,dc=com",
  "user_filter": "(uid={username})",
  "group_mappings": [
    { "idp_group": "cn=admins,ou=groups,dc=example,dc=com", "group": "admins" },
    { "idp_group": "cn=users,ou=groups,dc=example,dc=com", "group": "users" }
  ]
}
```

The secret is the bind password. AAM searches with the bind account, then binds again as the user to check the password. `{username}` in `user_filter` is escaped. The default filter is `(uid={username})`. Groups are the user's `memberOf` values, so `idp_group` is the group DN.

### Active Directory

Active Directory uses the same directory flow with `sAMAccountName` as the default login name.

```json
{
  "url": "ldaps://dc.example.com",
  "bind_dn": "CN=AAM Bind,OU=Services,DC=example,DC=com",
  "user_base_dn": "OU=Users,DC=example,DC=com",
  "user_filter": "(sAMAccountName={username})",
  "group_mappings": [
    { "idp_group": "CN=AAM Admins,OU=Groups,DC=example,DC=com", "group": "admins" }
  ]
}
```

The secret is the bind account password. `idp_group` is the group distinguished name from `memberOf`.

## Sessions

A successful login sets an HttpOnly `aam_session` cookie and also returns `access_token` in the JSON body. Send the cookie with browser requests (`credentials: include`) or send `Authorization: Bearer <access_token>`.

`AAM_SESSION_TTL_MINUTES` defaults to 480. The cookie is marked Secure when the request arrives as HTTPS or `X-Forwarded-Proto` is `https`. Sign out clears the cookie.

## Optional gateway headers

`AAM_TRUST_IDENTITY_HEADERS` defaults to `false`. Leave it false when people sign in on the AAM page.

Set it to `true` only when a trusted proxy in front of AAM strips client-supplied identity headers and sets them itself:

| Header | Meaning |
| --- | --- |
| `x-rh-user` | Username |
| `x-rh-email` | Email |
| `x-rh-roles` | Comma-separated roles |
| `x-rh-groups` | Comma-separated groups |

`aam.admin` or `platform-admin` is treated as system `admin`. `aam.viewer` is treated as system `auditor`. Other header values do not grant environment roles. A session cookie is still preferred when both are present.

`AAM_ALLOW_DEV_BYPASS=true` is accepted only when `AAM_ENVIRONMENT=development`. With no session and no username header, the API then treats the caller as a system administrator. Staging and production refuse to start with that flag set. The CRC lab sets it to `false`.

## Configuration reference

| Variable | Default | Purpose |
| --- | --- | --- |
| `AAM_SECRET_KEY` | insecure development value | Signs session cookies and encrypts provider secrets. Required in staging and production. |
| `AAM_BOOTSTRAP_ADMIN_USERNAME` | `admin` | Username used when the built-in administrator is first created. |
| `AAM_BOOTSTRAP_ADMIN_PASSWORD` | empty, then `ChangeMe-Admin1!` | Password used only when that user is first created. |
| `AAM_LOCAL_LOGIN_ENABLED` | `true` | When `false`, only the built-in administrator can use a password. |
| `AAM_PUBLIC_URL` | empty | Browser origin used for the OIDC redirect URI. Falls back to the request host. |
| `AAM_SESSION_TTL_MINUTES` | `480` | Session lifetime. |
| `AAM_TRUST_IDENTITY_HEADERS` | `false` | Accept `x-rh-*` identity headers from a trusted proxy. |
| `AAM_ALLOW_DEV_BYPASS` | `false` | Development-only anonymous administrator. |
| `AAM_CORS_ORIGINS` | `http://localhost:5173` | Comma-separated origins. Do not use `*` once browsers send the session cookie. |

CRC sets these in `deploy/openshift/base/configmap.yaml` and `deploy/openshift/base/secret.yaml`. Compose and Podman read `deploy/env/backend.env.example`.

Changing `AAM_SECRET_KEY` invalidates existing sessions and makes stored provider secrets unreadable. Set a new secret and re-enter provider secrets after a rotation.

## API

Public:

- `GET /api/v1/auth/providers`
- `POST /api/v1/auth/login` with `{ "username", "password" }`
- `POST /api/v1/auth/external` with `{ "provider_id", "username", "password" }` for LDAP and Active Directory
- `GET /api/v1/auth/oidc/authorize?provider_id=&redirect_to=/`
- `GET /api/v1/auth/oidc/callback`

Session required:

- `GET /api/v1/me`
- `POST /api/v1/auth/logout`
- `GET /api/v1/access/directory`
- `POST /api/v1/access/users`
- `PATCH /api/v1/access/users/{id}`
- `POST /api/v1/access/assignments`
- `DELETE /api/v1/access/assignments/{id}`
- `POST /api/v1/access/identity-providers`
- `PATCH /api/v1/access/identity-providers/{id}`
- `DELETE /api/v1/access/identity-providers/{id}`

`GET /api/v1/me` returns `system_roles`, `environment_roles`, and `visible_environment_ids`. `visible_environment_ids` is `null` when the caller can see every environment.
