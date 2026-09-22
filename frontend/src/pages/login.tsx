import { FormEvent, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";

import {
  Alert,
  Button,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  List,
  ListItem,
  LoginForm,
  LoginPage,
  TextInput,
  Title,
} from "@patternfly/react-core";

import { api } from "../api";
import { AapLogo } from "../components/aap-logo";
import { useAuth } from "../auth";
import type { AuthProvider } from "../types";

export function SignInPage() {
  const { user, refresh } = useAuth();
  const location = useLocation();
  const [providers, setProviders] = useState<AuthProvider[]>([]);
  const [localEnabled, setLocalEnabled] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [directoryProvider, setDirectoryProvider] = useState("");
  const [directoryUser, setDirectoryUser] = useState("");
  const [directoryPassword, setDirectoryPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api
      .authProviders(controller.signal)
      .then((payload) => {
        setProviders(payload.providers);
        setLocalEnabled(payload.local_login_enabled);
        const directory = payload.providers.find((item) => item.provider_type === "ldap" || item.provider_type === "ad");
        if (directory) {
          setDirectoryProvider(directory.id);
        }
      })
      .catch(() => setError("The sign-in options could not be loaded."));
    return () => controller.abort();
  }, []);

  if (user) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from !== "/login" ? from : "/"} replace />;
  }

  const destination = (location.state as { from?: string } | null)?.from || "/";
  const oidcProviders = providers.filter((item) => item.provider_type === "oidc");
  const directoryProviders = providers.filter((item) => item.provider_type === "ldap" || item.provider_type === "ad");

  async function submitLocal(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.login(username, password);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  async function submitDirectory(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.externalLogin(directoryProvider, directoryUser, directoryPassword);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Directory sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <LoginPage
      className="aam-login"
      brandImgAlt="Ansible"
      brandImgSrc="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3C/svg%3E"
      loginTitle="Sign in to Advanced Automation Manager"
      textContent="Local accounts stay available. OpenID Connect, LDAP, and Active Directory can be added by a system administrator."
    >
      <div className="aam-login-mark">
        <AapLogo />
      </div>
      {error ? (
        <Alert variant="danger" title={error} isInline style={{ marginBottom: "1rem" }} />
      ) : null}
      {localEnabled ? null : (
        <Alert
          variant="info"
          isInline
          title="Local sign-in is limited to the built-in administrator."
          style={{ marginBottom: "1rem" }}
        />
      )}
      <LoginForm
        usernameLabel="Username"
        usernameValue={username}
        onChangeUsername={(_event, value) => setUsername(value)}
        passwordLabel="Password"
        passwordValue={password}
        onChangePassword={(_event, value) => setPassword(value)}
        onLoginButtonClick={submitLocal}
        isLoginButtonDisabled={busy || !username || !password}
        loginButtonLabel="Log in"
      />
      {oidcProviders.length ? (
        <List isPlain style={{ marginTop: "1rem" }}>
          {oidcProviders.map((provider) => (
            <ListItem key={provider.id}>
              <Button
                variant="secondary"
                isBlock
                component="a"
                href={`/api/v1/auth/oidc/authorize?provider_id=${encodeURIComponent(provider.id)}&redirect_to=${encodeURIComponent(destination)}`}
              >
                Continue with {provider.name}
              </Button>
            </ListItem>
          ))}
        </List>
      ) : null}
      {directoryProviders.length ? (
        <Form onSubmit={submitDirectory} style={{ marginTop: "1.5rem" }}>
          <Title headingLevel="h2" size="md">
            Directory
          </Title>
          <FormGroup label="Provider" fieldId="directory-provider">
            <FormSelect id="directory-provider" value={directoryProvider} onChange={(_event, value) => setDirectoryProvider(value)}>
              {directoryProviders.map((provider) => (
                <FormSelectOption key={provider.id} value={provider.id} label={`${provider.name} (${provider.provider_type.toUpperCase()})`} />
              ))}
            </FormSelect>
          </FormGroup>
          <FormGroup label="Username" fieldId="directory-user">
            <TextInput id="directory-user" value={directoryUser} onChange={(_event, value) => setDirectoryUser(value)} />
          </FormGroup>
          <FormGroup label="Password" fieldId="directory-password">
            <TextInput
              id="directory-password"
              type="password"
              value={directoryPassword}
              onChange={(_event, value) => setDirectoryPassword(value)}
            />
          </FormGroup>
          <Button type="submit" variant="primary" isDisabled={busy || !directoryProvider || !directoryUser || !directoryPassword}>
            Sign in with directory
          </Button>
        </Form>
      ) : null}
    </LoginPage>
  );
}
