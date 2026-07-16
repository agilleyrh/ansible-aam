import { FormEvent, useState } from "react";
import type { SyntheticEvent } from "react";

import { Alert, Card, CardBody, CardHeader, Grid, GridItem, SearchInput, Stack, StackItem, Content, Title } from "@patternfly/react-core";
import { SearchIcon } from "@patternfly/react-icons";
import { Link } from "react-router-dom";

import { api } from "../api";
import { EmptyState } from "../components/empty-state";
import { PageHeader } from "../components/page-header";
import { StatusPill } from "../components/status-pill";
import type { SearchResult } from "../types";
import { humanize } from "../utils";

export function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event?: FormEvent | SyntheticEvent) {
    event?.preventDefault();
    setError(null);
    setSearched(true);
    setSearching(true);
    try {
      const value = await api.search(query);
      setResults(value);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <Stack hasGutter>
      <StackItem>
        <PageHeader
          section="Search"
          title="Search the collected automation inventory"
          description="Search templates, workflows, projects, credentials, activations, repositories, and collections across all synced AAP environments."
        />
      </StackItem>

      <StackItem>
        <Card >
          <CardBody>
            <form onSubmit={onSubmit}>
              <SearchInput
                value={query}
                onChange={(_, value) => setQuery(value)}
                onSearch={(_, value) => {
                  setQuery(value);
                  void onSubmit();
                }}
                onClear={() => {
                  setQuery("");
                  setResults([]);
                  setSearched(false);
                  setError(null);
                }}
                placeholder="Search resources by name, type, service, or environment"
                submitSearchButtonLabel="Search inventory"
                aria-label="Search collected inventory"
                isDisabled={searching}
              />
            </form>
            {error ? <Alert isInline variant="danger" title={error} /> : null}
          </CardBody>
        </Card>
      </StackItem>

      <StackItem>
        <Card >
          <CardHeader>
            <Stack>
              <StackItem>
                <Title headingLevel="h2" size="lg">
                  Search results
                </Title>
              </StackItem>
              <StackItem>
                <Content component="p" className="aam-muted">
                  Query across all registered environments or narrow the term to a specific service or resource type.
                </Content>
              </StackItem>
            </Stack>
          </CardHeader>
          <CardBody>
            {!searched ? (
              <EmptyState
                title="Start with a resource query"
                description="Search becomes useful after environments are registered and synced, but you can query as soon as inventory is available."
                icon={SearchIcon}
              />
            ) : results.length === 0 ? (
              <EmptyState
                title="No matching resources found"
                description="Try a broader term or make sure the relevant environment has completed a successful sync."
                icon={SearchIcon}
              />
            ) : (
              <Stack hasGutter>
                {results.map((result) => (
                  <Card key={result.id}  isCompact>
                    <CardBody>
                      <Grid hasGutter>
                        <GridItem md={4}>
                          <Title headingLevel="h3" size="md">
                            {result.name}
                          </Title>
                          <Content component="small" className="aam-muted">
                            {result.url ?? result.id}
                          </Content>
                        </GridItem>
                        <GridItem md={2}>
                          <Content component="small" className="aam-muted">
                            Environment
                          </Content>
                          <div>
                            <Link to={`/environments/${result.environment_id}`}>{result.environment_name}</Link>
                          </div>
                        </GridItem>
                        <GridItem md={2}>
                          <Content component="small" className="aam-muted">
                            Service
                          </Content>
                          <div>{result.service}</div>
                        </GridItem>
                        <GridItem md={2}>
                          <Content component="small" className="aam-muted">
                            Type
                          </Content>
                          <div>{humanize(result.resource_type)}</div>
                        </GridItem>
                        <GridItem md={2}>
                          <Content component="small" className="aam-muted">
                            Status
                          </Content>
                          <div>
                            <StatusPill status={result.status} />
                          </div>
                        </GridItem>
                      </Grid>
                    </CardBody>
                  </Card>
                ))}
              </Stack>
            )}
          </CardBody>
        </Card>
      </StackItem>
    </Stack>
  );
}
