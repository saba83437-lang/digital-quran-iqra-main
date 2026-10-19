import type { CSSProperties } from "react";
import type {
  AdvancedPosterElement,
  AdvancedPosterLayout,
} from "@/components/posters/advanced-poster-layout-editor";
import { LeagueStudentPhoto } from "@/features/najm-leagues/components/league-class-poster";
import type { SharedNajmStudentResult, SharedNajmClass } from "../types";

const FA = "۰۱۲۳۴۵۶۷۸۹";
const toFa = (value: number | string) =>
  String(value).replace(/[0-9]/g, (d) => FA[Number(d)]);
const fixed = (value: number) =>
  Number(value.toFixed(1)).toLocaleString("fa-IR");
function textLayoutElement(
  label: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fontSize: number,
  options: Partial<AdvancedPosterElement> = {},
): AdvancedPosterElement {
  return {
    label,
    kind: "text",
    x,
    y,
    width,
    height,
    fontSize,
    fontWeight: 800,
    lineHeight: 1.25,
    rotation: 0,
    color: "#f8fafc",
    align: "center",
    zIndex: 5,
    locked: false,
    hidden: false,
    ...options,
  };
}

function photoLayoutElement(
  label: string,
  x: number,
  y: number,
  size: number,
  options: Partial<AdvancedPosterElement> = {},
): AdvancedPosterElement {
  return {
    label,
    kind: "photo",
    x,
    y,
    width: size,
    height: size,
    rotation: 0,
    zIndex: 4,
    locked: false,
    hidden: false,
    ...options,
  };
}

export function createDefaultOverallLayout(): AdvancedPosterLayout {
  const elements: Record<string, AdvancedPosterElement> = {
    "header-title": textLayoutElement("عنوان اصلی", 240, 145, 1520, 105, 84, {
      color: "#fef3c7",
      fontWeight: 900,
    }),
    "header-subtitle": textLayoutElement(
      "نام ترم و سال تحصیلی",
      300,
      260,
      1400,
      65,
      40,
      {
        color: "#dbeafe",
        fontWeight: 600,
      },
    ),
    "top-1-photo": photoLayoutElement("عکس نفر اول", 863, 435, 275),
    "top-1-name": textLayoutElement("نام نفر اول", 690, 735, 620, 64, 49, {
      color: "#fef3c7",
      fontWeight: 900,
    }),
    "top-1-class": textLayoutElement("کلاس نفر اول", 690, 825, 620, 48, 27, {
      color: "#e8f3ff",
    }),
    "top-1-score": textLayoutElement("امتیاز نفر اول", 690, 900, 620, 50, 29, {
      color: "#ffe38a",
      fontWeight: 900,
    }),
    "top-2-photo": photoLayoutElement("عکس نفر دوم", 291, 579, 238),
    "top-2-name": textLayoutElement("نام نفر دوم", 135, 846, 550, 58, 43, {
      color: "#fef3c7",
      fontWeight: 900,
    }),
    "top-2-class": textLayoutElement("کلاس نفر دوم", 135, 925, 550, 44, 27, {
      color: "#e8f3ff",
    }),
    "top-2-score": textLayoutElement("امتیاز نفر دوم", 135, 995, 550, 48, 29, {
      color: "#ffe38a",
      fontWeight: 900,
    }),
    "top-3-photo": photoLayoutElement("عکس نفر سوم", 1471, 579, 238),
    "top-3-name": textLayoutElement("نام نفر سوم", 1315, 846, 550, 58, 43, {
      color: "#fef3c7",
      fontWeight: 900,
    }),
    "top-3-class": textLayoutElement("کلاس نفر سوم", 1315, 925, 550, 44, 27, {
      color: "#e8f3ff",
    }),
    "top-3-score": textLayoutElement("امتیاز نفر سوم", 1315, 995, 550, 48, 29, {
      color: "#ffe38a",
      fontWeight: 900,
    }),
  };

  const rowTops = [1260, 1478, 1695, 1913, 2130, 2348, 2565];
  rowTops.forEach((y, index) => {
    const rank = index + 4;
    const prefix = `row-${rank}`;
    elements[`${prefix}-rank`] = textLayoutElement(
      `رتبه ${rank}`,
      1688,
      y,
      172,
      188,
      27,
      {
        color: "#f8d56a",
        fontWeight: 900,
      },
    );
    elements[`${prefix}-photo`] = photoLayoutElement(
      `عکس رتبه ${rank}`,
      1494,
      y + 29,
      130,
    );
    elements[`${prefix}-name`] = textLayoutElement(
      `نام رتبه ${rank}`,
      828,
      y,
      602,
      188,
      36,
      {
        color: "#fff0ad",
        align: "right",
        fontWeight: 900,
      },
    );
    elements[`${prefix}-class`] = textLayoutElement(
      `کلاس رتبه ${rank}`,
      432,
      y,
      396,
      188,
      28,
      {
        color: "#f3f8ff",
      },
    );
    elements[`${prefix}-score`] = textLayoutElement(
      `امتیاز رتبه ${rank}`,
      140,
      y,
      292,
      188,
      28,
      {
        color: "#ffe38a",
        fontWeight: 900,
      },
    );
  });

  return {
    version: 1,
    canvasWidth: 2000,
    canvasHeight: 3000,
    printWidthMm: 200,
    printHeightMm: 300,
    elements,
  };
}

export function createDefaultClassLayout(): AdvancedPosterLayout {
  const elements: Record<string, AdvancedPosterElement> = {
    "header-title": textLayoutElement("عنوان کلاس", 200, 65, 1200, 58, 42, {
      color: "#fef3c7",
      fontWeight: 900,
    }),
    "header-subtitle": textLayoutElement(
      "استاد، رتبه و میانگین",
      250,
      126,
      1100,
      38,
      20,
      {
        color: "#dbeafe",
        fontWeight: 600,
      },
    ),
    "top-1-photo": photoLayoutElement("عکس نفر اول", 690, 205, 220),
    "top-1-name": textLayoutElement("نام نفر اول", 576, 484, 448, 38, 39, {
      color: "#fef3c7",
      fontWeight: 900,
    }),
    "top-1-class": textLayoutElement("کلاس نفر اول", 576, 536, 448, 30, 22, {
      color: "#e8f3ff",
    }),
    "top-1-score": textLayoutElement("امتیاز نفر اول", 576, 585, 448, 32, 23, {
      color: "#ffe38a",
      fontWeight: 900,
    }),
    "top-2-photo": photoLayoutElement("عکس نفر دوم", 337, 264, 190),
    "top-2-name": textLayoutElement("نام نفر دوم", 232, 517, 400, 34, 34, {
      color: "#fef3c7",
      fontWeight: 900,
    }),
    "top-2-class": textLayoutElement("کلاس نفر دوم", 232, 564, 400, 28, 22, {
      color: "#e8f3ff",
    }),
    "top-2-score": textLayoutElement("امتیاز نفر دوم", 232, 611, 400, 30, 23, {
      color: "#ffe38a",
      fontWeight: 900,
    }),
    "top-3-photo": photoLayoutElement("عکس نفر سوم", 1073, 264, 190),
    "top-3-name": textLayoutElement("نام نفر سوم", 968, 517, 400, 34, 34, {
      color: "#fef3c7",
      fontWeight: 900,
    }),
    "top-3-class": textLayoutElement("کلاس نفر سوم", 968, 564, 400, 28, 22, {
      color: "#e8f3ff",
    }),
    "top-3-score": textLayoutElement("امتیاز نفر سوم", 968, 611, 400, 30, 23, {
      color: "#ffe38a",
      fontWeight: 900,
    }),
  };

  [748, 902].forEach((y, index) => {
    const rank = index + 4;
    const prefix = `row-${rank}`;
    elements[`${prefix}-rank`] = textLayoutElement(
      `رتبه ${rank}`,
      1262,
      y,
      146,
      127,
      22,
      {
        color: "#f8d56a",
        fontWeight: 900,
      },
    );
    elements[`${prefix}-photo`] = photoLayoutElement(
      `عکس رتبه ${rank}`,
      1125,
      y + 12,
      104,
    );
    elements[`${prefix}-name`] = textLayoutElement(
      `نام رتبه ${rank}`,
      678,
      y,
      414,
      127,
      29,
      {
        color: "#fff0ad",
        align: "right",
        fontWeight: 900,
      },
    );
    elements[`${prefix}-class`] = textLayoutElement(
      `کلاس رتبه ${rank}`,
      399,
      y,
      279,
      127,
      23,
      {
        color: "#f3f8ff",
      },
    );
    elements[`${prefix}-score`] = textLayoutElement(
      `امتیاز رتبه ${rank}`,
      192,
      y,
      207,
      127,
      23,
      {
        color: "#ffe38a",
        fontWeight: 900,
      },
    );
  });

  return {
    version: 1,
    canvasWidth: 1600,
    canvasHeight: 1100,
    printWidthMm: 160,
    printHeightMm: 110,
    elements,
  };
}

export const DEFAULT_OVERALL_LAYOUT = createDefaultOverallLayout();
export const DEFAULT_CLASS_LAYOUT = createDefaultClassLayout();
export function resolveReadOnlyLayout(
  saved: AdvancedPosterLayout | null | undefined,
  fallback: AdvancedPosterLayout,
): AdvancedPosterLayout {
  if (!saved || typeof saved.elements !== "object")
    return JSON.parse(JSON.stringify(fallback));
  const elements: Record<string, AdvancedPosterElement> = {};
  for (const [id, element] of Object.entries(fallback.elements))
    elements[id] = { ...element, ...(saved.elements[id] ?? {}) };
  return {
    ...fallback,
    ...saved,
    canvasWidth: fallback.canvasWidth,
    canvasHeight: fallback.canvasHeight,
    elements,
  };
}
type RenderItem = {
  id: string;
  kind: "text" | "photo";
  content?: string;
  student?: SharedNajmStudentResult;
  className?: string;
};
function style(
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
    zIndex: element.zIndex,
    color: element.color,
    fontSize: element.fontSize
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
    display: element.hidden ? "none" : "flex",
    alignItems: "center",
    overflow: "hidden",
  };
}
function Poster({
  layout,
  items,
  backgroundUrl,
  label,
}: {
  layout: AdvancedPosterLayout;
  items: RenderItem[];
  backgroundUrl: string;
  label: string;
}) {
  const map = new Map(items.map((item) => [item.id, item]));
  return (
    <div className="overflow-x-auto rounded-3xl bg-slate-100 p-2">
      <div
        data-najm-poster-export="true"
        data-export-width={layout.canvasWidth}
        data-export-height={layout.canvasHeight}
        data-export-label={label}
        className="najm-poster-canvas relative mx-auto min-w-[700px] overflow-hidden rounded-2xl bg-[#07182d] bg-[length:100%_100%] bg-no-repeat shadow-xl"
        dir="rtl"
        style={{
          aspectRatio: `${layout.canvasWidth}/${layout.canvasHeight}`,
          backgroundImage: `url("${backgroundUrl}")`,
          containerType: "inline-size",
        }}
      >
        {Object.entries(layout.elements).map(([id, element]) => {
          const item = map.get(id);
          if (!item || element.hidden) return null;
          return (
            <div
              key={id}
              style={style(element, layout)}
              className={`whitespace-nowrap ${item.className ?? ""}`}
            >
              {item.kind === "photo" && item.student ? (
                <LeagueStudentPhoto
                  posterPhotoUrl={item.student.poster_avatar_url}
                  avatarUrl={item.student.avatar_url}
                  name={item.student.name}
                  cutout={Boolean(item.student.poster_avatar_url)}
                />
              ) : (
                <span className="w-full overflow-hidden text-ellipsis">
                  {item.content}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
export function OverallResultPoster({
  layout,
  backgroundUrl,
  students,
  title,
  year,
}: {
  layout: AdvancedPosterLayout;
  backgroundUrl: string;
  students: SharedNajmStudentResult[];
  title: string;
  year: string;
}) {
  const items: RenderItem[] = [
    {
      id: "header-title",
      kind: "text",
      content: "۱۰ نفر برتر کل دارالقرآن",
      className: "font-display",
    },
    {
      id: "header-subtitle",
      kind: "text",
      content: `${title} • سال تحصیلی ${toFa(year)}`,
    },
  ];
  students.slice(0, 3).forEach((student, index) => {
    const p = `top-${index + 1}`;
    items.push(
      { id: `${p}-photo`, kind: "photo", student },
      {
        id: `${p}-name`,
        kind: "text",
        content: student.name,
        className: "font-display",
      },
      { id: `${p}-class`, kind: "text", content: `کلاس ${student.class_name}` },
      {
        id: `${p}-score`,
        kind: "text",
        content: `${toFa(student.total)} امتیاز`,
        className: "font-display",
      },
    );
  });
  students.slice(3, 10).forEach((student, index) => {
    const rank = index + 4,
      p = `row-${rank}`;
    items.push(
      { id: `${p}-rank`, kind: "text", content: `رتبه ${toFa(rank)}` },
      { id: `${p}-photo`, kind: "photo", student },
      {
        id: `${p}-name`,
        kind: "text",
        content: student.name,
        className: "font-display",
      },
      { id: `${p}-class`, kind: "text", content: `کلاس ${student.class_name}` },
      {
        id: `${p}-score`,
        kind: "text",
        content: `${toFa(student.total)} امتیاز`,
      },
    );
  });
  return (
    <Poster
      layout={layout}
      items={items}
      backgroundUrl={backgroundUrl}
      label={`۱۰ نفر برتر - ${year}`}
    />
  );
}
export function ClassResultPoster({
  layout,
  backgroundUrl,
  classInfo,
  students,
  rank,
}: {
  layout: AdvancedPosterLayout;
  backgroundUrl: string;
  classInfo: SharedNajmClass;
  students: SharedNajmStudentResult[];
  rank: number;
}) {
  const avg = students.length
    ? students.reduce((sum, s) => sum + s.average, 0) / students.length
    : 0;
  const items: RenderItem[] = [
    {
      id: "header-title",
      kind: "text",
      content: `نتایج برترین‌های کلاس ${classInfo.name}`,
      className: "font-display",
    },
    {
      id: "header-subtitle",
      kind: "text",
      content: `استاد: ${classInfo.teacher_name} • رتبه کلاس ${toFa(rank)} • میانگین ${fixed(avg)} از ۳۰`,
    },
  ];
  students.slice(0, 5).forEach((student, index) => {
    const n = index + 1,
      p = n <= 3 ? `top-${n}` : `row-${n}`;
    if (n >= 4)
      items.push({ id: `${p}-rank`, kind: "text", content: `رتبه ${toFa(n)}` });
    items.push(
      { id: `${p}-photo`, kind: "photo", student },
      {
        id: `${p}-name`,
        kind: "text",
        content: student.name,
        className: "font-display",
      },
      { id: `${p}-class`, kind: "text", content: `کلاس ${student.class_name}` },
      {
        id: `${p}-score`,
        kind: "text",
        content: `${toFa(student.total)} امتیاز`,
      },
    );
  });
  return (
    <Poster
      layout={layout}
      items={items}
      backgroundUrl={backgroundUrl}
      label={`نتایج کلاس ${classInfo.name}`}
    />
  );
}
