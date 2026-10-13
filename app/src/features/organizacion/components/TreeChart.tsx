import { Background, BackgroundVariant, Controls, Handle, MarkerType, Panel, Position, ReactFlow, ReactFlowProvider, useReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button, Space } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { NODE_H, NODE_W, layoutChart, type ChartInput, type Entry } from '../chartLayout';
import { CROP_NAME, CropSeal, type Crop, type CropLegendEntry } from '../crops';

/** One card of a diagram. Siblings are drawn in the order the items are given. */
export interface ChartItem {
  id: string;
  parentId: string | null;
  eyebrow: string;
  title: string;
  line1?: string | null;
  line2?: string | null;
  badge?: string | number | null;
  badgeTitle?: string;
  /** Short accent label, e.g. the role a person holds on this área. */
  tag?: string | null;
  tone?: 'root' | 'strong' | 'normal' | 'group' | 'team' | 'person';
  /** Crop of the branch the card belongs to (ADR-0002): tints the card. */
  crop?: Crop | null;
  /** Seal drawn on the card: the empresa's sprout or the crop of a branch. Other cards have none. */
  seal?: Crop | 'brote' | null;
  lit?: boolean;
  dim?: boolean;
  inactive?: boolean;
  /** False for cards that only give context and open no detail. */
  selectable?: boolean;
  /** Draws the children in rows beside the card instead of below it; 'ordered' adds arrows from one to the next. */
  row?: 'ordered' | 'plain';
}

/** Handles each kind of connector leaves from and arrives at. */
const HANDLES: Record<Entry, { source: string; target: string }> = {
  top: { source: 'down', target: 'top' },
  side: { source: 'stack', target: 'side' },
  next: { source: 'next', target: 'side' },
  wrap: { source: 'down', target: 'top' },
};

interface CardData extends Record<string, unknown> {
  item: ChartItem;
  childCount: number;
  collapsed: boolean;
  dim: boolean;
  onToggle: (id: string) => void;
}
type CardNode = Node<CardData, 'card'>;

function ItemCard({ data, selected }: NodeProps<CardNode>) {
  const { item } = data;
  const classes = ['org-node', `tone-${item.tone ?? 'normal'}`, item.crop && 'has-crop', item.seal && 'has-seal', selected && 'is-selected', (data.dim || item.dim) && 'is-dim', item.lit && 'is-lit', item.inactive && 'is-inactive', item.selectable === false && 'is-static'];
  return (
    <div className={classes.filter(Boolean).join(' ')} data-crop={item.crop ?? undefined}>
      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="target" position={Position.Left} id="side" />
      {item.seal && <CropSeal crop={item.seal} size={item.seal === 'brote' ? 52 : 44} />}
      <div className="org-body">
        <div className="org-top">
          <span className="org-kind">{item.eyebrow}</span>
          <span className="org-top-right">
            {item.tag && <span className="org-tag">{item.tag}</span>}
            {item.badge !== null && item.badge !== undefined && (
              <span className="org-people" title={item.badgeTitle}>
                {item.badge}
              </span>
            )}
          </span>
        </div>
        <div className="org-name">{item.title}</div>
        <div className="org-lead">{item.line1}</div>
        <div className="org-meta">{item.line2}</div>
      </div>
      {data.childCount > 0 && (
        <button
          type="button"
          className="org-toggle nodrag nopan"
          aria-label={data.collapsed ? `Mostrar los ${data.childCount} elementos de ${item.title}` : `Ocultar los elementos de ${item.title}`}
          onClick={(event) => {
            event.stopPropagation();
            data.onToggle(item.id);
          }}
        >
          {data.collapsed ? `+${data.childCount}` : '−'}
        </button>
      )}
      <Handle type="source" position={Position.Bottom} id="down" />
      <Handle type="source" position={Position.Right} id="next" />
      <Handle type="source" position={Position.Bottom} id="stack" style={{ left: 18 }} />
    </div>
  );
}
const nodeTypes = { card: ItemCard };

interface Props {
  items: ChartItem[];
  mode: 'dark' | 'light';
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  /** Search result: undefined = no search. Matches stay lit, their branches open, the view frames them. */
  matchIds?: string[];
  /** Cards to bring into view when they change (e.g. what a person covers). */
  frameIds?: string[];
  /** Branches that start closed. */
  initiallyCollapsed?: string[];
  /** Which crop stands for which branch; shown in a corner when given. */
  legend?: CropLegendEntry[];
  emptyText?: string;
}

function Chart({ items, mode, selectedId, onSelect, matchIds, frameIds, initiallyCollapsed, legend, emptyText }: Props) {
  const flow = useReactFlow();
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(initiallyCollapsed));
  const toggle = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const { nodes, edges, parents } = useMemo(() => {
    const byId = new Map(items.map((item) => [item.id, item]));
    const childrenOf = new Map<string | null, ChartItem[]>();
    for (const item of items) {
      const parent = item.parentId && byId.has(item.parentId) ? item.parentId : null;
      childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), item]);
    }
    // A search opens the path to every match, whatever was collapsed.
    const forcedOpen = new Set<string>();
    for (const id of matchIds ?? []) {
      for (let item = byId.get(id); item?.parentId; item = byId.get(item.parentId)) forcedOpen.add(item.parentId);
    }
    const isOpen = (id: string) => !collapsed.has(id) || forcedOpen.has(id);
    const toInput = (item: ChartItem): ChartInput => ({ id: item.id, row: Boolean(item.row), children: isOpen(item.id) ? (childrenOf.get(item.id) ?? []).map(toInput) : [] });
    const placed = layoutChart((childrenOf.get(null) ?? []).map(toInput));

    const nodes: CardNode[] = placed.map(({ id, x, y }) => {
      const item = byId.get(id)!;
      return {
        id,
        type: 'card',
        position: { x, y },
        width: NODE_W,
        height: NODE_H,
        selected: id === selectedId,
        selectable: item.selectable !== false,
        data: {
          item,
          childCount: (childrenOf.get(id) ?? []).length,
          collapsed: !isOpen(id),
          dim: Boolean(matchIds?.length) && !matchIds!.includes(id),
          onToggle: toggle,
        },
      };
    });
    const edges: Edge[] = placed
      .filter((p) => p.fromId)
      .map((p) => {
        const ordered = (p.entry === 'next' || p.entry === 'wrap') && byId.get(byId.get(p.id)!.parentId!)?.row === 'ordered';
        return {
          id: `${p.fromId}-${p.id}`,
          source: p.fromId!,
          target: p.id,
          sourceHandle: HANDLES[p.entry].source,
          targetHandle: HANDLES[p.entry].target,
          type: 'smoothstep',
          focusable: false,
          ...(ordered && { markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 } }),
        };
      });
    return { nodes, edges, parents: items.filter((item) => item.parentId && childrenOf.has(item.id)).map((item) => item.id) };
  }, [items, matchIds, collapsed, selectedId]);

  // Re-frame when the shape of the chart changes: around what was searched or asked to be shown.
  const focus = matchIds?.length ? matchIds : frameIds?.length ? frameIds : [];
  const shape = `${nodes.length}:${focus.join(',')}`;
  useEffect(() => {
    const shown = new Set(nodes.map((node) => node.id));
    const target = focus.filter((id) => shown.has(id)).map((id) => ({ id }));
    const timer = setTimeout(() => void flow.fitView({ nodes: target.length ? target : undefined, padding: 0.12, maxZoom: matchIds?.length ? 1 : 0.7, duration: 350 }), 60);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      colorMode={mode}
      defaultMarkerColor={null}
      fitView
      minZoom={0.12}
      maxZoom={1.6}
      nodesDraggable={false}
      nodesConnectable={false}
      edgesFocusable={false}
      onNodeClick={(_, node) => node.data.item.selectable !== false && onSelect?.(node.id)}
      onPaneClick={() => onSelect?.(null)}
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} />
      <Controls showInteractive={false} position="bottom-left" />
      <Panel position="top-left">
        <Space>
          <Button size="small" onClick={() => setCollapsed(new Set())}>
            Expandir todo
          </Button>
          <Button size="small" onClick={() => setCollapsed(new Set(parents))}>
            Contraer
          </Button>
        </Space>
      </Panel>
      {legend && legend.length > 0 && (
        <Panel position="bottom-center">
          <details className="crop-legend" open>
            <summary className="eyebrow">Un cultivo por dirección</summary>
            <ul>
              {legend.map((entry) => (
                <li key={entry.id} title={CROP_NAME[entry.crop]}>
                  <CropSeal crop={entry.crop} size={18} />
                  {entry.label}
                </li>
              ))}
            </ul>
          </details>
        </Panel>
      )}
      {(!items.length || (matchIds && !matchIds.length)) && (
        <Panel position="top-center">
          <span className="org-empty">{emptyText ?? 'Nada coincide con la búsqueda'}</span>
        </Panel>
      )}
    </ReactFlow>
  );
}

/** A tree drawn as connected cards: pan, zoom, collapse branches, click a card for its detail. */
export function TreeChart(props: Props) {
  return (
    <ReactFlowProvider>
      <Chart {...props} />
    </ReactFlowProvider>
  );
}
