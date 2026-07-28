import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Imagework | 자동 투명 이미지 작업자",
  description: "이미지와 설정은 전용 서버 작업자에서 일시적으로 처리되며, 완료 후 선택한 PNG, SVG 또는 ZIP 결과를 브라우저로 다운로드합니다. Hugging Face·Google 자격 증명은 브라우저에 입력하거나 저장하지 않습니다.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
