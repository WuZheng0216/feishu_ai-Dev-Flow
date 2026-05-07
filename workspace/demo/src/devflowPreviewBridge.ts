import { useEffect } from "react";

type SelectModeMessage = {
  type: "devflow:set-select-mode";
  enabled: boolean;
};

export function useDevflowPreviewBridge() {
  useEffect(() => {
    let isSelectMode = false;
    let hoveredElement: HTMLElement | undefined;

    const clearHover = () => {
      hoveredElement?.classList.remove("devflowSelectableHover");
      hoveredElement = undefined;
    };

    const setSelectMode = (enabled: boolean) => {
      isSelectMode = enabled;
      document.body.classList.toggle("devflowSelectMode", enabled);
      if (!enabled) {
        clearHover();
      }
    };

    const handleMessage = (event: MessageEvent<SelectModeMessage>) => {
      if (event.data?.type !== "devflow:set-select-mode") {
        return;
      }

      setSelectMode(Boolean(event.data.enabled));
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!isSelectMode) {
        return;
      }

      const target = findSelectableElement(event.target);

      if (target === hoveredElement) {
        return;
      }

      clearHover();
      hoveredElement = target;
      hoveredElement?.classList.add("devflowSelectableHover");
    };

    const handleClick = (event: MouseEvent) => {
      if (!isSelectMode) {
        return;
      }

      const target = findSelectableElement(event.target);

      if (!target) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const bounds = target.getBoundingClientRect();
      window.parent.postMessage(
        {
          type: "devflow:element-selected",
          element: {
            devflowId: target.dataset.devflowId ?? "",
            file: target.dataset.devflowFile,
            selector: `[data-devflow-id="${target.dataset.devflowId ?? ""}"]`,
            tagName: target.tagName.toLowerCase(),
            className: target.className,
            text: normalizeText(target.innerText),
            bounds: {
              x: Math.round(bounds.x),
              y: Math.round(bounds.y),
              width: Math.round(bounds.width),
              height: Math.round(bounds.height)
            }
          }
        },
        "*"
      );

      setSelectMode(false);
    };

    window.addEventListener("message", handleMessage);
    window.addEventListener("pointermove", handlePointerMove, true);
    window.addEventListener("click", handleClick, true);
    window.parent.postMessage({ type: "devflow:preview-ready" }, "*");

    return () => {
      clearHover();
      document.body.classList.remove("devflowSelectMode");
      window.removeEventListener("message", handleMessage);
      window.removeEventListener("pointermove", handlePointerMove, true);
      window.removeEventListener("click", handleClick, true);
    };
  }, []);
}

function findSelectableElement(target: EventTarget | null): HTMLElement | undefined {
  if (!(target instanceof HTMLElement)) {
    return undefined;
  }

  return target.closest<HTMLElement>("[data-devflow-id]") ?? undefined;
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 240);
}
