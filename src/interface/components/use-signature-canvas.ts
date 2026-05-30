"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sigLog, sigWarn } from "@/interface/components/signature-canvas-debug";

const PEN_COLOR = "rgb(15, 23, 42)";
const BG_COLOR = "rgb(255, 255, 255)";

export function useSignatureCanvas(enabled: boolean) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
  const hasInkRef = useRef(false);
  const drawingRef = useRef(false);

  const setCanvasNode = useCallback((node: HTMLCanvasElement | null) => {
    canvasRef.current = node;
    setCanvasEl(node);
    sigLog(node ? "canvas ref attached" : "canvas ref detached", {
      enabled,
    });
  }, [enabled]);

  const paintBackground = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = PEN_COLOR;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const fitCanvas = useCallback((canvas: HTMLCanvasElement) => {
    const parent = canvas.parentElement;
    const width = parent?.clientWidth ?? canvas.offsetWidth;
    const height = parent?.clientHeight ?? 144;
    if (width < 2 || height < 2) {
      sigWarn("fitCanvas skipped — size too small", { width, height });
      return false;
    }

    const ratio = Math.max(window.devicePixelRatio ?? 1, 1);
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      sigWarn("fitCanvas failed — no 2d context");
      return false;
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    paintBackground(ctx, width, height);
    sigLog("fitCanvas ok", {
      width,
      height,
      bufferWidth: canvas.width,
      bufferHeight: canvas.height,
      ratio,
    });
    return true;
  }, [paintBackground]);

  useEffect(() => {
    if (!enabled) {
      hasInkRef.current = false;
      drawingRef.current = false;
      sigLog("hook disabled");
      return;
    }

    if (!canvasEl) {
      sigWarn("hook enabled but canvas element not mounted yet");
      return;
    }

    const canvas = canvasEl;
    let active = true;
    let layoutReady = false;
    let moveCount = 0;

    sigLog("binding pointer listeners", {
      canvasConnected: canvas.isConnected,
      pointerEvents: getComputedStyle(canvas).pointerEvents,
    });

    const tryFit = () => {
      if (!active || layoutReady) return;
      if (fitCanvas(canvas)) layoutReady = true;
    };

    const observer = new ResizeObserver(() => {
      sigLog("ResizeObserver fired", { layoutReady });
      tryFit();
    });
    if (canvas.parentElement) observer.observe(canvas.parentElement);
    requestAnimationFrame(() => requestAnimationFrame(tryFit));

    const pos = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        rectW: rect.width,
        rectH: rect.height,
      };
    };

    const onPointerDown = (e: PointerEvent) => {
      sigLog("pointerdown", {
        button: e.button,
        pointerId: e.pointerId,
        pointerType: e.pointerType,
        target: (e.target as Element)?.tagName,
        ...pos(e),
      });
      if (e.button !== 0) {
        sigWarn("pointerdown ignored — not primary button", { button: e.button });
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      let captured = false;
      try {
        canvas.setPointerCapture(e.pointerId);
        captured = canvas.hasPointerCapture(e.pointerId);
      } catch (err) {
        sigWarn("setPointerCapture failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      sigLog("pointer capture", { captured, pointerId: e.pointerId });

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        sigWarn("pointerdown — no 2d context");
        return;
      }
      drawingRef.current = true;
      moveCount = 0;
      const { x, y } = pos(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y);
      ctx.stroke();
      hasInkRef.current = true;
      sigLog("stroke started", { x, y });
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!drawingRef.current) return;
      e.preventDefault();
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const { x, y } = pos(e);
      ctx.lineTo(x, y);
      ctx.stroke();
      hasInkRef.current = true;
      moveCount += 1;
      if (moveCount <= 3 || moveCount % 20 === 0) {
        sigLog("pointermove (drawing)", { x, y, moveCount });
      }
    };

    const endStroke = (e: PointerEvent) => {
      if (!drawingRef.current) return;
      sigLog("stroke ended", {
        type: e.type,
        moveCount,
        hasInk: hasInkRef.current,
      });
      drawingRef.current = false;
      moveCount = 0;
      try {
        if (canvas.hasPointerCapture(e.pointerId)) {
          canvas.releasePointerCapture(e.pointerId);
        }
      } catch {
        // ignore
      }
    };

    const onLostCapture = (e: PointerEvent) => {
      sigWarn("lostpointercapture", { pointerId: e.pointerId });
      endStroke(e);
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", endStroke);
    canvas.addEventListener("pointercancel", endStroke);
    canvas.addEventListener("lostpointercapture", onLostCapture);

    const strokeTo = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const onMouseDown = (e: MouseEvent) => {
      sigLog("mousedown (fallback)", { button: e.button });
      if (e.button !== 0 || drawingRef.current) return;
      e.preventDefault();
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      drawingRef.current = true;
      moveCount = 0;
      const { x, y } = strokeTo(e.clientX, e.clientY);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y);
      ctx.stroke();
      hasInkRef.current = true;
      sigLog("stroke started (mouse)", { x, y });
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!drawingRef.current) return;
      e.preventDefault();
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const { x, y } = strokeTo(e.clientX, e.clientY);
      ctx.lineTo(x, y);
      ctx.stroke();
      hasInkRef.current = true;
      moveCount += 1;
      if (moveCount <= 3) sigLog("mousemove (mouse)", { x, y, moveCount });
    };
    const onMouseUp = () => {
      if (!drawingRef.current) return;
      sigLog("stroke ended (mouse)", { moveCount, hasInk: hasInkRef.current });
      drawingRef.current = false;
      moveCount = 0;
    };
    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      active = false;
      sigLog("cleanup listeners");
      observer.disconnect();
      drawingRef.current = false;
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", endStroke);
      canvas.removeEventListener("pointercancel", endStroke);
      canvas.removeEventListener("lostpointercapture", onLostCapture);
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [enabled, canvasEl, fitCanvas]);

  const clear = useCallback(() => {
    sigLog("clear()");
    hasInkRef.current = false;
    drawingRef.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const ratio = Math.max(window.devicePixelRatio ?? 1, 1);
    const width = canvas.width / ratio;
    const height = canvas.height / ratio;
    if (width < 2 || height < 2) return;
    paintBackground(ctx, width, height);
  }, [paintBackground]);

  const isEmpty = useCallback(() => !hasInkRef.current, []);

  const toPngDataUrl = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return "";
    const url = canvas.toDataURL("image/png");
    sigLog("toPngDataUrl()", { length: url.length });
    return url;
  }, []);

  return { setCanvasRef: setCanvasNode, clear, isEmpty, toPngDataUrl };
}
