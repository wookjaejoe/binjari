import type { Metadata, Viewport } from "next";
import "./globals.css";

import { Providers } from "@/app/providers";

export const metadata: Metadata = {
  title: "빈자리",
  description: "공공캠핑장에 지금 열려 있는 자리를 구역·객실 단위로 한 화면에서 봐요.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  colorScheme: "light",
  // 화면 맨 위가 머리 띠(--ink)라 브라우저 상단 막대도 같은 색으로 잇는다.
  themeColor: "#1a1a19",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
