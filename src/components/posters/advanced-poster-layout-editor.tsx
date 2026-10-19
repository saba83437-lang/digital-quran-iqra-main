import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  Grid3X3,
  LayoutTemplate,
  Loader2,
  Lock,
  Maximize2,
  Move,
  Redo2,
  RotateCcw,
  RotateCw,
  Save,
  Settings2,
  Undo2,
  Unlock,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export type AdvancedPosterElementKind = "text" | "photo";
export type AdvancedPosterTextAlign = "right" | "center" | "left";
export type AdvancedPosterElement = {
  label: string;
  content?: string;
  kind: AdvancedPosterElementKind;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
  fontWeight?: number;
  fontFamily?: string;
  lineHeight?: number;
  rotation: number;
  color?: string;
  backgroundColor?: string;
  opacity?: number;
  borderRadius?: number;
  align?: AdvancedPosterTextAlign;
  zIndex: number;
  locked: boolean;
  hidden: boolean;
};
export type AdvancedPosterLayout = {
  version: number;
  canvasWidth: number;
  canvasHeight: number;
  printWidthMm: number;
  printHeightMm: number;
  backgroundSize?: string;
  backgroundPosition?: string;
  elements: Record<string, AdvancedPosterElement>;
};
type InteractionMode =
  | "drag"
  | "resize-nw"
  | "resize-ne"
  | "resize-sw"
  | "resize-se";
type EditorInteraction = {
  id: string;
  mode: InteractionMode;
  startClientX: number;
  startClientY: number;
  startElement: AdvancedPosterElement;
  startLayout: AdvancedPosterLayout;
  scaleX: number;
  scaleY: number;
  moved: boolean;
};
export type AdvancedPosterLayoutEditorProps = {
  open: boolean;
  title: string;
  layout: AdvancedPosterLayout;
  defaultLayout: AdvancedPosterLayout;
  backgroundUrl: string;
  canvasClassName?: string;
  sidebarBefore?: ReactNode;
  allowTextContent?: boolean;
  allowCanvasResize?: boolean;
  renderContent: (id: string, element: AdvancedPosterElement) => ReactNode;
  onClose: () => void;
  onSave: (layout: AdvancedPosterLayout) => Promise<void>;
};
const POSTER_FONT_OPTIONS = [
  { value: "Vazirmatn", label: "وزیرمتن" },
  { value: "Amiri", label: "امیری" },
  { value: "Lalezar", label: "لاله‌زار" },
  { value: "Noto Naskh Arabic", label: "نوتو نسخ عربی" },
  { value: "Markazi Text", label: "مرکزی" },
] as const;
const FA = "۰۱۲۳۴۵۶۷۸۹";
const toFa = (value: number | string) =>
  String(value).replace(/[0-9]/g, (d) => FA[Number(d)]);
const fixed = (value: number, digits = 1) =>
  Number(value.toFixed(digits)).toLocaleString("fa-IR");
export function cloneAdvancedPosterLayout(
  layout: AdvancedPosterLayout,
): AdvancedPosterLayout {
  return JSON.parse(JSON.stringify(layout)) as AdvancedPosterLayout;
}
function elementStyle(
  element: AdvancedPosterElement,
  layout: AdvancedPosterLayout,
): CSSProperties {
  const align = element.align ?? "center";
  return {
    position: "absolute",
    left: `${(element.x / layout.canvasWidth) * 100}%`,
    top: `${(element.y / layout.canvasHeight) * 100}%`,
    width: `${(element.width / layout.canvasWidth) * 100}%`,
    height: `${(element.height / layout.canvasHeight) * 100}%`,
    transform: `rotate(${element.rotation ?? 0}deg)`,
    transformOrigin: "center",
    zIndex: element.zIndex,
    color: element.color,
    backgroundColor: element.backgroundColor,
    opacity: element.opacity ?? 1,
    borderRadius: element.borderRadius,
    fontSize:
      element.kind === "text" && element.fontSize
        ? `${(element.fontSize / layout.canvasWidth) * 100}cqw`
        : undefined,
    fontWeight: element.fontWeight,
    fontFamily: element.fontFamily,
    lineHeight: element.lineHeight,
    textAlign: align,
    justifyContent:
      align === "right"
        ? "flex-start"
        : align === "left"
          ? "flex-end"
          : "center",
  };
}
function AdvancedPosterElements({
  layout,
  selectedId,
  renderContent,
  onSelect,
  onBeginInteraction,
}: {
  layout: AdvancedPosterLayout;
  selectedId: string | null;
  renderContent: AdvancedPosterLayoutEditorProps["renderContent"];
  onSelect: (id: string) => void;
  onBeginInteraction: (
    event: ReactPointerEvent<HTMLElement>,
    id: string,
    mode: InteractionMode,
  ) => void;
}) {
  return Object.entries(layout.elements).map(([id, element]) => {
    if (element.hidden) return null;
    const selected = selectedId === id;
    const handles = selected && !element.locked && (
      <>
        {(["nw", "ne", "sw", "se"] as const).map((corner) => (
          <span
            key={corner}
            className={`poster-resize-handle poster-resize-${corner}`}
            onPointerDown={(event) => {
              event.stopPropagation();
              onBeginInteraction(event, id, `resize-${corner}`);
            }}
          />
        ))}
      </>
    );
    return (
      <button
        key={id}
        type="button"
        className={`poster-free-element poster-free-element-editing ${selected ? "poster-free-element-selected" : ""} ${element.locked ? "poster-free-element-locked" : ""} ${element.kind === "photo" ? "poster-free-photo" : "poster-free-text"} flex items-center justify-center overflow-hidden`}
        style={elementStyle(element, layout)}
        onPointerDown={(event) => {
          onSelect(id);
          if (!element.locked) onBeginInteraction(event, id, "drag");
        }}
        title={element.label}
      >
        {renderContent(id, element)}
        {handles}
      </button>
    );
  });
}

export function AdvancedPosterLayoutEditor({
  open,
  title,
  canvasClassName = "najm-layout-canvas-class",
  renderContent,
  sidebarBefore,
  allowTextContent = false,
  allowCanvasResize = false,
  layout,
  defaultLayout,
  backgroundUrl,
  onClose,
  onSave,
}: AdvancedPosterLayoutEditorProps) {
  const [draft, setDraft] = useState(() => cloneAdvancedPosterLayout(layout));
  const [selectedId, setSelectedId] = useState<string | null>(
    () => Object.keys(layout.elements)[0] ?? null,
  );
  const [past, setPast] = useState<AdvancedPosterLayout[]>([]);
  const [future, setFuture] = useState<AdvancedPosterLayout[]>([]);
  const [unit, setUnit] = useState<"px" | "mm">("px");
  const [showGrid, setShowGrid] = useState(true);
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [gridSize, setGridSize] = useState(10);
  const [saving, setSaving] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<EditorInteraction | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(cloneAdvancedPosterLayout(layout));
    setPast([]);
    setFuture([]);
    setSelectedId(Object.keys(layout.elements)[0] ?? null);
  }, [open, layout]);

  const selected = selectedId ? draft.elements[selectedId] : null;
  const pxPerMmX = draft.canvasWidth / draft.printWidthMm;
  const pxPerMmY = draft.canvasHeight / draft.printHeightMm;
  const unitStep = unit === "mm" ? 0.1 : 1;

  function pushHistory(snapshot = draft) {
    setPast((current) => [
      ...current.slice(-59),
      cloneAdvancedPosterLayout(snapshot),
    ]);
    setFuture([]);
  }

  function patchSelected(patch: Partial<AdvancedPosterElement>, record = true) {
    if (!selectedId || !draft.elements[selectedId]) return;
    if (record) pushHistory();
    setDraft((current) => ({
      ...current,
      elements: {
        ...current.elements,
        [selectedId]: { ...current.elements[selectedId], ...patch },
      },
    }));
  }

  function patchPrintSize(
    patch: Partial<
      Pick<AdvancedPosterLayout, "printWidthMm" | "printHeightMm">
    >,
  ) {
    pushHistory();
    setDraft((current) => ({ ...current, ...patch }));
  }

  function resizeCanvas(nextWidth: number, nextHeight: number) {
    if (!allowCanvasResize || nextWidth < 320 || nextHeight < 240) return;
    pushHistory();
    setDraft((current) => {
      const scaleX = nextWidth / current.canvasWidth;
      const scaleY = nextHeight / current.canvasHeight;
      return {
        ...current,
        canvasWidth: nextWidth,
        canvasHeight: nextHeight,
        elements: Object.fromEntries(
          Object.entries(current.elements).map(([id, element]) => [
            id,
            {
              ...element,
              x: element.x * scaleX,
              y: element.y * scaleY,
              width: element.width * scaleX,
              height: element.height * scaleY,
              fontSize:
                element.fontSize == null
                  ? undefined
                  : element.fontSize * Math.min(scaleX, scaleY),
            },
          ]),
        ),
      };
    });
  }

  function undo() {
    if (!past.length) return;
    const previous = past[past.length - 1];
    setFuture((current) =>
      [cloneAdvancedPosterLayout(draft), ...current].slice(0, 60),
    );
    setPast((current) => current.slice(0, -1));
    setDraft(cloneAdvancedPosterLayout(previous));
  }

  function redo() {
    if (!future.length) return;
    const next = future[0];
    setPast((current) =>
      [...current, cloneAdvancedPosterLayout(draft)].slice(-60),
    );
    setFuture((current) => current.slice(1));
    setDraft(cloneAdvancedPosterLayout(next));
  }

  function snap(value: number) {
    if (!snapEnabled || gridSize <= 0) return value;
    return Math.round(value / gridSize) * gridSize;
  }

  function beginInteraction(
    event: ReactPointerEvent<HTMLElement>,
    id: string,
    mode: EditorInteraction["mode"],
  ) {
    const element = draft.elements[id];
    const canvas = canvasRef.current;
    if (!element || element.locked || !canvas) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(id);
    const rect = canvas.getBoundingClientRect();
    const interaction: EditorInteraction = {
      id,
      mode,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startElement: { ...element },
      startLayout: cloneAdvancedPosterLayout(draft),
      scaleX: draft.canvasWidth / rect.width,
      scaleY: draft.canvasHeight / rect.height,
      moved: false,
    };
    interactionRef.current = interaction;

    const handleMove = (pointerEvent: PointerEvent) => {
      const active = interactionRef.current;
      if (!active) return;
      const dx = (pointerEvent.clientX - active.startClientX) * active.scaleX;
      const dy = (pointerEvent.clientY - active.startClientY) * active.scaleY;
      if (Math.abs(dx) + Math.abs(dy) > 0.5) active.moved = true;
      const start = active.startElement;
      let x = start.x;
      let y = start.y;
      let width = start.width;
      let height = start.height;

      if (active.mode === "drag") {
        x = snap(start.x + dx);
        y = snap(start.y + dy);
      } else {
        const corner = active.mode.replace("resize-", "");
        if (corner.includes("e")) width = snap(Math.max(20, start.width + dx));
        if (corner.includes("s"))
          height = snap(Math.max(20, start.height + dy));
        if (corner.includes("w")) {
          x = snap(start.x + dx);
          width = snap(Math.max(20, start.width - dx));
        }
        if (corner.includes("n")) {
          y = snap(start.y + dy);
          height = snap(Math.max(20, start.height - dy));
        }
      }

      width = Math.min(width, draft.canvasWidth);
      height = Math.min(height, draft.canvasHeight);
      x = Math.max(0, Math.min(x, draft.canvasWidth - width));
      y = Math.max(0, Math.min(y, draft.canvasHeight - height));

      setDraft((current) => ({
        ...current,
        elements: {
          ...current.elements,
          [active.id]: { ...current.elements[active.id], x, y, width, height },
        },
      }));
    };

    const handleEnd = () => {
      const active = interactionRef.current;
      if (active?.moved) {
        setPast((current) => [...current.slice(-59), active.startLayout]);
        setFuture([]);
      }
      interactionRef.current = null;
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleEnd);
      window.removeEventListener("pointercancel", handleEnd);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleEnd);
    window.addEventListener("pointercancel", handleEnd);
  }

  function handleKeyboard(event: ReactKeyboardEvent<HTMLDivElement>) {
    const tagName = (event.target as HTMLElement).tagName;
    if (
      ["INPUT", "SELECT", "TEXTAREA"].includes(tagName) ||
      !selected ||
      selected.locked
    )
      return;
    const amount = event.altKey ? 0.1 : event.shiftKey ? 10 : 1;
    const moves: Record<string, { x: number; y: number }> = {
      ArrowRight: { x: amount, y: 0 },
      ArrowLeft: { x: -amount, y: 0 },
      ArrowUp: { x: 0, y: -amount },
      ArrowDown: { x: 0, y: amount },
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    patchSelected(
      {
        x: Math.max(
          0,
          Math.min(selected.x + move.x, draft.canvasWidth - selected.width),
        ),
        y: Math.max(
          0,
          Math.min(selected.y + move.y, draft.canvasHeight - selected.height),
        ),
      },
      true,
    );
  }

  function displayValue(value: number, axis: "x" | "y") {
    if (unit === "px") return Number(value.toFixed(2));
    return Number((value / (axis === "x" ? pxPerMmX : pxPerMmY)).toFixed(2));
  }

  function sourceValue(value: number, axis: "x" | "y") {
    return unit === "px" ? value : value * (axis === "x" ? pxPerMmX : pxPerMmY);
  }

  async function save() {
    setSaving(true);
    try {
      await onSave(draft);
      setPast([]);
      setFuture([]);
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "خطا در ذخیره چیدمان پوستر",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent
        dir="rtl"
        className="flex h-[95vh] !max-w-[98vw] flex-col overflow-hidden border-amber-200 bg-[#f8f3e7] p-0"
      >
        <DialogHeader className="border-b border-amber-200 bg-white/80 px-5 py-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2 font-display text-xl text-emerald-950">
                <LayoutTemplate className="h-5 w-5 text-amber-700" />
                ویرایشگر چیدمان {title}
              </DialogTitle>
              <DialogDescription className="mt-1">
                جابه‌جایی با ماوس، تغییر اندازه از گوشه‌ها و تنظیم دقیق با پیکسل
                یا میلی‌متر
              </DialogDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={undo}
                disabled={!past.length}
              >
                <Undo2 className="ml-1 h-4 w-4" /> بازگشت
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={redo}
                disabled={!future.length}
              >
                <Redo2 className="ml-1 h-4 w-4" /> تکرار
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  pushHistory();
                  setDraft(cloneAdvancedPosterLayout(defaultLayout));
                  setSelectedId(Object.keys(defaultLayout.elements)[0] ?? null);
                }}
              >
                <RotateCcw className="ml-1 h-4 w-4" /> پیش‌فرض
              </Button>
              <Button size="sm" onClick={() => void save()} disabled={saving}>
                {saving ? (
                  <Loader2 className="ml-1 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="ml-1 h-4 w-4" />
                )}
                ذخیره چیدمان
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden xl:grid-cols-[minmax(0,1fr)_360px]">
          <div
            className="najm-layout-workspace min-h-0 overflow-auto p-4"
            tabIndex={0}
            onKeyDown={handleKeyboard}
          >
            <div className="mb-3 flex flex-wrap items-center justify-center gap-2 text-xs">
              <Badge variant="outline">
                بوم {toFa(draft.canvasWidth)}×{toFa(draft.canvasHeight)} px
              </Badge>
              <Badge variant="outline">
                چاپ {toFa(draft.printWidthMm)}×{toFa(draft.printHeightMm)} mm
              </Badge>
              <Button
                type="button"
                size="sm"
                variant={showGrid ? "default" : "outline"}
                onClick={() => setShowGrid((value) => !value)}
              >
                <Grid3X3 className="ml-1 h-3.5 w-3.5" /> شبکه
              </Button>
              <Button
                type="button"
                size="sm"
                variant={snapEnabled ? "default" : "outline"}
                onClick={() => setSnapEnabled((value) => !value)}
              >
                <Move className="ml-1 h-3.5 w-3.5" /> چسبیدن به شبکه
              </Button>
            </div>

            <div
              ref={canvasRef}
              className={`najm-layout-canvas relative mx-auto overflow-hidden bg-[#07182d] bg-[length:100%_100%] bg-no-repeat ${canvasClassName}`}
              style={{
                aspectRatio: `${draft.canvasWidth} / ${draft.canvasHeight}`,
                backgroundImage: `url("${backgroundUrl}")`,
                backgroundSize: draft.backgroundSize ?? "100% 100%",
                backgroundPosition: draft.backgroundPosition ?? "center",
              }}
              onPointerDown={() => setSelectedId(null)}
            >
              {showGrid && (
                <div
                  className="pointer-events-none absolute inset-0 z-[1000]"
                  style={{
                    backgroundImage:
                      "linear-gradient(rgba(212,175,55,.16) 1px,transparent 1px),linear-gradient(90deg,rgba(212,175,55,.16) 1px,transparent 1px)",
                    backgroundSize: `${Math.max(0.5, (gridSize / draft.canvasWidth) * 100)}% ${Math.max(0.5, (gridSize / draft.canvasHeight) * 100)}%`,
                  }}
                />
              )}
              <AdvancedPosterElements
                layout={draft}
                selectedId={selectedId}
                renderContent={renderContent}
                onSelect={setSelectedId}
                onBeginInteraction={beginInteraction}
              />
            </div>
          </div>

          <aside className="min-h-0 overflow-y-auto border-r border-amber-200 bg-white/85 p-4">
            <div className="mb-4 flex items-center gap-2 font-bold text-emerald-950">
              <Settings2 className="h-4 w-4 text-amber-700" /> تنظیمات دقیق عنصر
            </div>

            {sidebarBefore}

            <label className="mb-4 block text-xs font-bold text-muted-foreground">
              انتخاب عنصر
              <select
                value={selectedId ?? ""}
                onChange={(event) => setSelectedId(event.target.value || null)}
                className="mt-1 h-10 w-full rounded-xl border border-amber-200 bg-white px-3 text-sm text-foreground"
              >
                <option value="">بدون انتخاب</option>
                {Object.entries(draft.elements).map(([id, element]) => (
                  <option key={id} value={id}>
                    {element.label} {element.hidden ? "(مخفی)" : ""}
                  </option>
                ))}
              </select>
            </label>

            <div className="mb-4 grid grid-cols-2 gap-2">
              <Button
                size="sm"
                variant={unit === "px" ? "default" : "outline"}
                onClick={() => setUnit("px")}
              >
                پیکسل
              </Button>
              <Button
                size="sm"
                variant={unit === "mm" ? "default" : "outline"}
                onClick={() => setUnit("mm")}
              >
                میلی‌متر
              </Button>
            </div>

            {selected ? (
              <div className="space-y-4">
                <div className="rounded-xl bg-emerald-50 p-3 text-sm font-black text-emerald-950">
                  {selected.label}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <EditorNumberField
                    label={`X (${unit})`}
                    value={displayValue(selected.x, "x")}
                    step={unitStep}
                    onChange={(value) =>
                      patchSelected({ x: sourceValue(value, "x") })
                    }
                  />
                  <EditorNumberField
                    label={`Y (${unit})`}
                    value={displayValue(selected.y, "y")}
                    step={unitStep}
                    onChange={(value) =>
                      patchSelected({ y: sourceValue(value, "y") })
                    }
                  />
                  <EditorNumberField
                    label={`عرض (${unit})`}
                    value={displayValue(selected.width, "x")}
                    min={unitStep}
                    step={unitStep}
                    onChange={(value) =>
                      patchSelected({
                        width: Math.max(20, sourceValue(value, "x")),
                      })
                    }
                  />
                  <EditorNumberField
                    label={`ارتفاع (${unit})`}
                    value={displayValue(selected.height, "y")}
                    min={unitStep}
                    step={unitStep}
                    onChange={(value) =>
                      patchSelected({
                        height: Math.max(20, sourceValue(value, "y")),
                      })
                    }
                  />
                </div>

                <EditorNumberField
                  label="چرخش (درجه)"
                  value={selected.rotation}
                  min={-360}
                  max={360}
                  step={0.1}
                  onChange={(value) => patchSelected({ rotation: value })}
                  icon={<RotateCw className="h-3.5 w-3.5" />}
                />

                <EditorNumberField
                  label="لایه (Z-index)"
                  value={selected.zIndex}
                  min={0}
                  max={999}
                  step={1}
                  onChange={(value) =>
                    patchSelected({ zIndex: Math.round(value) })
                  }
                />

                {selected.kind === "text" && (
                  <>
                    {allowTextContent && (
                      <label className="block text-[11px] font-bold text-muted-foreground">
                        متن سفارشی عنصر
                        <Input
                          value={selected.content ?? ""}
                          placeholder="خالی = متن خودکار"
                          onChange={(event) =>
                            patchSelected({
                              content: event.target.value || undefined,
                            })
                          }
                          className="mt-1 h-10 rounded-xl border-amber-200 bg-white text-sm"
                        />
                      </label>
                    )}
                    <label className="block text-[11px] font-bold text-muted-foreground">
                      خانواده فونت
                      <select
                        value={selected.fontFamily ?? ""}
                        onChange={(event) =>
                          patchSelected({
                            fontFamily: event.target.value || undefined,
                          })
                        }
                        className="mt-1 h-10 w-full rounded-xl border border-amber-200 bg-white px-3 text-sm text-foreground"
                        style={{ fontFamily: selected.fontFamily }}
                      >
                        <option value="">فونت پیش‌فرض عنصر</option>
                        {POSTER_FONT_OPTIONS.map((font) => (
                          <option
                            key={font.value}
                            value={font.value}
                            style={{ fontFamily: font.value }}
                          >
                            {font.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="grid grid-cols-2 gap-3">
                      <EditorNumberField
                        label="اندازه قلم (px)"
                        value={selected.fontSize ?? 24}
                        min={4}
                        max={300}
                        step={0.5}
                        onChange={(value) => patchSelected({ fontSize: value })}
                      />
                      <EditorNumberField
                        label="ضخامت قلم"
                        value={selected.fontWeight ?? 700}
                        min={100}
                        max={900}
                        step={100}
                        onChange={(value) =>
                          patchSelected({ fontWeight: value })
                        }
                      />
                      <EditorNumberField
                        label="فاصله خط"
                        value={selected.lineHeight ?? 1.25}
                        min={0.7}
                        max={3}
                        step={0.05}
                        onChange={(value) =>
                          patchSelected({ lineHeight: value })
                        }
                      />
                      <label className="text-[11px] font-bold text-muted-foreground">
                        رنگ نوشته
                        <div className="mt-1 flex h-10 items-center gap-2 rounded-xl border border-amber-200 bg-white px-2">
                          <input
                            type="color"
                            value={selected.color ?? "#ffffff"}
                            onChange={(event) =>
                              patchSelected({ color: event.target.value })
                            }
                            className="h-7 w-10 cursor-pointer border-0 bg-transparent"
                          />
                          <span className="font-mono text-[10px]">
                            {selected.color ?? "#ffffff"}
                          </span>
                        </div>
                      </label>
                    </div>

                    <label className="block text-[11px] font-bold text-muted-foreground">
                      چینش نوشته
                      <select
                        value={selected.align ?? "center"}
                        onChange={(event) =>
                          patchSelected({
                            align: event.target
                              .value as AdvancedPosterTextAlign,
                          })
                        }
                        className="mt-1 h-10 w-full rounded-xl border border-amber-200 bg-white px-3 text-sm text-foreground"
                      >
                        <option value="right">راست‌چین</option>
                        <option value="center">وسط‌چین</option>
                        <option value="left">چپ‌چین</option>
                      </select>
                    </label>
                  </>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant={selected.locked ? "default" : "outline"}
                    onClick={() => patchSelected({ locked: !selected.locked })}
                  >
                    {selected.locked ? (
                      <Lock className="ml-1 h-4 w-4" />
                    ) : (
                      <Unlock className="ml-1 h-4 w-4" />
                    )}
                    {selected.locked ? "قفل است" : "قفل عنصر"}
                  </Button>
                  <Button
                    variant={selected.hidden ? "default" : "outline"}
                    onClick={() => patchSelected({ hidden: !selected.hidden })}
                  >
                    {selected.hidden ? "نمایش عنصر" : "مخفی‌کردن"}
                  </Button>
                </div>

                <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-[10px] leading-6 text-amber-950">
                  <p>کلیدهای جهت‌نما: جابه‌جایی ۱ پیکسل</p>
                  <p>Shift + جهت‌نما: جابه‌جایی ۱۰ پیکسل</p>
                  <p>Alt + جهت‌نما: جابه‌جایی ۰٫۱ پیکسل</p>
                  <p>
                    هر ۱mm افقی برابر {fixed(pxPerMmX, 2)}px و عمودی برابر{" "}
                    {fixed(pxPerMmY, 2)}px است.
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed p-8 text-center text-xs text-muted-foreground">
                یک نوشته یا عکس را از روی پوستر یا فهرست بالا انتخاب کنید.
              </div>
            )}

            <div className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50/70 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-bold text-emerald-900">
                <Grid3X3 className="h-3.5 w-3.5" /> تنظیم شبکه
              </div>
              <EditorNumberField
                label="اندازه شبکه (px)"
                value={gridSize}
                min={1}
                max={200}
                step={1}
                onChange={(value) => setGridSize(Math.max(1, value))}
              />
            </div>

            {allowCanvasResize && (
              <div className="mt-4 rounded-xl border border-purple-100 bg-purple-50/70 p-3">
                <div className="mb-2 flex items-center gap-2 text-xs font-bold text-purple-900">
                  <Maximize2 className="h-3.5 w-3.5" /> اندازه کلی بوم رده
                </div>
                <p className="mb-2 text-[10px] leading-5 text-purple-800">
                  با تغییر بوم، موقعیت و اندازه همه عناصر متناسب با آن مقیاس
                  می‌شود.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <EditorNumberField
                    label="عرض بوم (px)"
                    value={draft.canvasWidth}
                    min={320}
                    step={10}
                    onChange={(value) =>
                      resizeCanvas(value, draft.canvasHeight)
                    }
                  />
                  <EditorNumberField
                    label="ارتفاع بوم (px)"
                    value={draft.canvasHeight}
                    min={240}
                    step={10}
                    onChange={(value) => resizeCanvas(draft.canvasWidth, value)}
                  />
                </div>
              </div>
            )}

            <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/70 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-bold text-blue-900">
                <Maximize2 className="h-3.5 w-3.5" /> اندازه فیزیکی چاپ
              </div>
              <div className="grid grid-cols-2 gap-2">
                <EditorNumberField
                  label="عرض چاپ (mm)"
                  value={draft.printWidthMm}
                  min={1}
                  step={0.1}
                  onChange={(value) =>
                    patchPrintSize({ printWidthMm: Math.max(1, value) })
                  }
                />
                <EditorNumberField
                  label="ارتفاع چاپ (mm)"
                  value={draft.printHeightMm}
                  min={1}
                  step={0.1}
                  onChange={(value) =>
                    patchPrintSize({ printHeightMm: Math.max(1, value) })
                  }
                />
              </div>
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditorNumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  icon,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  icon?: ReactNode;
}) {
  return (
    <label className="block text-[11px] font-bold text-muted-foreground">
      <span className="flex items-center gap-1">
        {icon}
        {label}
      </span>
      <Input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
        className="mt-1 h-10 rounded-xl border-amber-200 bg-white text-sm"
      />
    </label>
  );
}
