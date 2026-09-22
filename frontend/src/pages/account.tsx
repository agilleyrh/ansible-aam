import { useEffect, useState } from "react";

import {
  Button,
  Card,
  CardBody,
  CardHeader,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Form,
  FormGroup,
  Stack,
  StackItem,
  TextInput,
  Title,
} from "@patternfly/react-core";

import { api } from "../api";
import { useAuth } from "../auth";
import type { EnvironmentSummary } from "../types";

export function AccountPage() {
  const { user } = useAuth();
  const [environments, setEnvironments] = useState<EnvironmentSummary[]>([]);
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .environments()
      .then(setEnvironments)
      .catch(() => setEnvironments([]));
  }, []);

  const names = new Map(environments.map((environment) => [environment.id, environment.name]));
  const environmentRoles = Object.entries(user?.environment_roles ?? {});

  return (
    <Stack hasGutter>
      <StackItem>
        <Card>
          <CardHeader>
            <Title headingLevel="h2" size="lg">
              Profile
            </Title>
          </CardHeader>
          <CardBody>
            <DescriptionList isHorizontal>
              <DescriptionListGroup>
                <DescriptionListTerm>Username</DescriptionListTerm>
                <DescriptionListDescription>{user?.username ?? "—"}</DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>Email</DescriptionListTerm>
                <DescriptionListDescription>{user?.email || "—"}</DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>Sign-in</DescriptionListTerm>
                <DescriptionListDescription>{user?.auth_source || "local"}</DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>System roles</DescriptionListTerm>
                <DescriptionListDescription>{user?.system_roles?.join(", ") || "—"}</DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>Groups</DescriptionListTerm>
                <DescriptionListDescription>{user?.groups?.join(", ") || "—"}</DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>Environment roles</DescriptionListTerm>
                <DescriptionListDescription>
                  {environmentRoles.length === 0
                    ? "—"
                    : environmentRoles
                        .map(([environmentId, roles]) => `${names.get(environmentId) ?? environmentId}: ${roles.join(", ")}`)
                        .join("; ")}
                </DescriptionListDescription>
              </DescriptionListGroup>
            </DescriptionList>
          </CardBody>
        </Card>
      </StackItem>
      <StackItem>
        <Card>
          <CardHeader>
            <Title headingLevel="h2" size="lg">
              Password
            </Title>
          </CardHeader>
          <CardBody>
            <Form
              onSubmit={(event) => {
                event.preventDefault();
                if (!user?.id) {
                  setError("This session cannot change a password.");
                  return;
                }
                if (nextPassword !== confirmPassword) {
                  setError("The passwords do not match.");
                  setMessage("");
                  return;
                }
                setBusy(true);
                setError("");
                setMessage("");
                api
                  .updateAccessUser(user.id, { password: nextPassword })
                  .then(() => {
                    setNextPassword("");
                    setConfirmPassword("");
                    setMessage("Password updated.");
                  })
                  .catch((err: unknown) => setError(err instanceof Error ? err.message : "The password could not be changed."))
                  .finally(() => setBusy(false));
              }}
            >
              <FormGroup label="New password" fieldId="account-page-password" isRequired>
                <TextInput
                  id="account-page-password"
                  type="password"
                  value={nextPassword}
                  onChange={(_event, value) => setNextPassword(value)}
                />
              </FormGroup>
              <FormGroup label="Confirm password" fieldId="account-page-password-confirm" isRequired>
                <TextInput
                  id="account-page-password-confirm"
                  type="password"
                  value={confirmPassword}
                  onChange={(_event, value) => setConfirmPassword(value)}
                />
              </FormGroup>
              <p className="aam-form-help">Use at least 14 characters and three of digits, uppercase, lowercase, and symbols.</p>
              {error ? <p className="aam-muted">{error}</p> : null}
              {message ? <p className="aam-form-help">{message}</p> : null}
              <Button type="submit" variant="primary" isDisabled={busy || !user?.id} isLoading={busy}>
                Save password
              </Button>
            </Form>
          </CardBody>
        </Card>
      </StackItem>
    </Stack>
  );
}
