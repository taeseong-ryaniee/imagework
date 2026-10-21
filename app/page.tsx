import { ImageProcessor } from "../components/image-processor";

export default function Home() {
  return (
    <main className="helper-page">
      <section className="helper-shell" aria-labelledby="helper-title">
        <header className="helper-intro">
          <div className="brand-row">
            <p className="brand-lockup">IMAGEWORK / GPU WORKER</p>
            <span className="product-pill">자동 처리·다운로드</span>
          </div>
          <h1 id="helper-title">투명 이미지를<br />원하는 형식으로 받으세요.</h1>
          <p>파일의 실제 픽셀 크기를 자동으로 확인하고, 사내 GPU 작업자가 결과를 만든 뒤 브라우저로 다운로드합니다.</p>
        </header>
        <ImageProcessor />
      </section>
    </main>
  );
}
