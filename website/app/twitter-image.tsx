import { ImageResponse } from "next/og";

export const alt = "TaxTrax Consulting: Bringing Together the Best in Tax Services";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "linear-gradient(135deg,#2D2D2D,#141414)", color: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: "#FF0404", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 38, fontWeight: 800 }}>T</div>
          <div style={{ fontSize: 40, fontWeight: 700 }}>TaxTrax Consulting</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.1 }}>Bringing Together the Best in Tax Services</div>
          <div style={{ marginTop: 24, fontSize: 30, color: "#FFB3B3" }}>FBR · SECP · USA LLC · UK Ltd · UAE VAT</div>
        </div>
      </div>
    ),
    size,
  );
}
