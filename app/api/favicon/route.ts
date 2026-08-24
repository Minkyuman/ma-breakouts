import { createElement, type ReactNode } from "react";
import { ImageResponse } from "next/og";

export const runtime = "edge";

const block = (style: Record<string, string | number>, children?: ReactNode) =>
  createElement("div", { style }, children);

export function GET() {
  return new ImageResponse(
    block({
      width: "64px", height: "64px", display: "flex", position: "relative", overflow: "hidden",
      borderRadius: "15px", background: "#ccecff", alignItems: "center", justifyContent: "center",
    }, [
      block({
        position: "absolute", left: "8px", right: "8px", top: "34px", height: "7px", borderRadius: "99px",
        background: "#8d67d6", border: "2px solid #dac9ff",
      }),
      block({
        width: "22px", height: "28px", borderRadius: "7px", background: "#fb5b59", border: "3px solid #112d5c",
        display: "flex", position: "relative", alignItems: "center", justifyContent: "center",
      }, [
        block({ position: "absolute", top: "-10px", width: "8px", height: "8px", borderRadius: "3px", background: "#ffe7a8", border: "3px solid #112d5c" }),
        block({ width: "5px", height: "5px", borderRadius: "99px", background: "#112d5c", marginRight: "4px" }),
        block({ width: "5px", height: "5px", borderRadius: "99px", background: "#112d5c" }),
      ]),
    ]),
    { width: 64, height: 64 },
  );
}
