import { useEffect, useState } from "react";

import {
  Alert,
  Bullseye,
  Card,
  CardBody,
  CardHeader,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  ExpandableSection,
  FormSelect,
  FormSelectOption,
  Grid,
  GridItem,
  Label,
  Stack,
  StackItem,
  Text,
  Title,
} from "@patternfly/react-core";
import { Link } from "react-router-dom";

import { api } from "../api";
import { EmptyState } from "../components/empty-state";
import { LinkButton } from "../components/link-button";
import { PageHeader } from "../components/page-header";
import { StatusPill } from "../components/status-pill";
import type { EnvironmentSummary, TopologyEdge, TopologyNode, TopologyResponse } from "../types";
import { stringifyValue } from "../utils";

type TreeNode = TopologyNode & { children: TreeNode[] };

function buildTree(nodes: TopologyNode[], edges: TopologyEdge[]): TreeNode[] {
  const nodeMap = new Map<string, TreeNode>();
  for (const node of nodes) {
    nodeMap.set(node.id, { ...node, children: [] });
  }

  const childIds = new Set<string>();
  for (const edge of edges) {
    const parent = nodeMap.get(edge.source);
    const child = nodeMap.get(edge.target);
    if (parent && child) {
      parent.children.push(child);
      childIds.add(edge.target);
    }
  }

  return nodes.filter((node) => !childIds.has(node.id)).map((node) => nodeMap.get(node.id)!);
}

function TopologyNodeCard({ node }: { node: TreeNode }) {
  return (
    <div className="aam-topology-tree">
      <Card className="aam-topology-node" data-kind={node.kind} isFlat>
        <CardHeader>
          <Grid hasGutter style={{ width: "100%" }}>
            <GridItem md={8}>
              <Title headingLevel="h3" size="md">
                {node.label}
              </Title>
              <Text component="small" className="aam-muted">
                {node.kind}
              </Text>
            </GridItem>
            <GridItem md={4} style={{ textAlign: "right" }}>
              <StatusPill status={node.status} />
            </GridItem>
          </Grid>
        </CardHeader>
        <CardBody>
          {Object.keys(node.metadata).length > 0 ? (
            <DescriptionList isCompact isHorizontal columnModifier={{ default: "1Col" }}>
              {Object.entries(node.metadata)
                .slice(0, 3)
                .map(([key, value]) => (
                  <DescriptionListGroup key={key}>
                    <DescriptionListTerm>{key.replaceAll("_", " ")}</DescriptionListTerm>
                    <DescriptionListDescription>{stringifyValue(value)}</DescriptionListDescription>
                  </DescriptionListGroup>
                ))}
            </DescriptionList>
          ) : (
            <Text component="small" className="aam-muted">
              No additional metadata declared.
            </Text>
          )}
        </CardBody>
      </Card>
      {node.children.length > 0 ? (
        <div className="aam-topology-children">
          {node.children.map((child) => (
            <TopologyNodeCard key={child.id} node={child} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TopologyEdgeList({ edges, nodes }: { edges: TopologyEdge[]; nodes: TopologyNode[] }) {
  const nodeLabels = new Map(nodes.map((node) => [node.id, node.label]));
  if (edges.length === 0) {
    return null;
  }

  return (
    <ExpandableSection toggleText={`${edges.length} relationship${edges.length !== 1 ? "s" : ""}`}>
      <Stack hasGutter>
        {edges.map((edge, index) => (
          <Card key={`${edge.source}-${edge.target}-${index}`} isFlat isCompact>
            <CardBody>
              <Grid hasGutter>
                <GridItem md={5}>{nodeLabels.get(edge.source) ?? edge.source}</GridItem>
                <GridItem md={2}>
                  <Label color="blue">{edge.relationship}</Label>
                </GridItem>
                <GridItem md={5}>{nodeLabels.get(edge.target) ?? edge.target}</GridItem>
              </Grid>
            </CardBody>
          </Card>
        ))}
      </Stack>
    </ExpandableSection>
  );
}

export function TopologyPage() {
  const [environments, setEnvironments] = useState<EnvironmentSummary[]>([]);
  const [selected, setSelected] = useState("");
  const [topology, setTopology] = useState<TopologyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .environments()
      .then((items) => {
        setEnvironments(items);
        if (items.length > 0) {
          setSelected(items[0].id);
        }
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!selected) {
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setTopology(null);
    api
      .topology(selected, controller.signal)
      .then(setTopology)
      .catch((err: Error) => {
        if (!controller.signal.aborted) {
          setError(err.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [selected]);

  if (error && !topology) {
    return <Alert isInline variant="danger" title={`Topology unavailable: ${error}`} />;
  }

  const tree = topology ? buildTree(topology.nodes, topology.edges) : [];

  return (
    <Stack hasGutter>
      <StackItem>
        <PageHeader
          section="Topology"
          title="Service and resource relationships"
          description="Follow how each environment expands into services, collected resources, and declared platform integrations such as operators, Terraform, receptor, Backstage, and MCP."
          actions={
            environments.length > 0 ? (
              <FormSelect value={selected} onChange={(_, value) => setSelected(value)} aria-label="Select environment topology">
                {environments.map((environment) => (
                  <FormSelectOption key={environment.id} value={environment.id} label={environment.name} />
                ))}
              </FormSelect>
            ) : undefined
          }
        />
      </StackItem>

      {environments.length === 0 ? (
        <StackItem>
          <Card isFlat>
            <CardBody>
              <EmptyState
                title="No topology available yet"
                description="Register and sync at least one AAP environment to populate service and resource relationships."
                action={
                  <LinkButton to="/environments" variant="primary">
                    Register first environment
                  </LinkButton>
                }
              />
            </CardBody>
          </Card>
        </StackItem>
      ) : loading ? (
        <StackItem>
          <Bullseye>
            <Card isFlat>
              <CardBody>Loading topology...</CardBody>
            </Card>
          </Bullseye>
        </StackItem>
      ) : topology && topology.nodes.length === 0 ? (
        <StackItem>
          <Card isFlat>
            <CardBody>
              <EmptyState title="No topology data" description="Queue a sync for this environment to populate the topology graph." />
            </CardBody>
          </Card>
        </StackItem>
      ) : (
        <StackItem>
          <Card isFlat>
            <CardHeader>
              <Stack>
                <StackItem>
                  <Title headingLevel="h2" size="lg">
                    Environment topology
                  </Title>
                </StackItem>
                <StackItem>
                  <Text component="p" className="aam-muted">
                    Nodes show the discovered and declared control-plane relationships for the selected environment.
                  </Text>
                </StackItem>
              </Stack>
            </CardHeader>
            <CardBody>
              <Stack hasGutter>
                {tree.map((root) => (
                  <StackItem key={root.id}>
                    <TopologyNodeCard node={root} />
                  </StackItem>
                ))}
                {topology ? <TopologyEdgeList edges={topology.edges} nodes={topology.nodes} /> : null}
                {selected ? (
                  <Text component="small" className="aam-muted">
                    Need the full configuration context? Open <Link to={`/environments/${selected}`}>the environment detail page</Link>.
                  </Text>
                ) : null}
              </Stack>
            </CardBody>
          </Card>
        </StackItem>
      )}
    </Stack>
  );
}
