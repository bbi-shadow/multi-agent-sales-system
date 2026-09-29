const cards = [
  ['Tổng khách hàng', '0'], ['Lead tiềm năng', '0'], ['Nội dung chờ duyệt', '0'], ['Email đã gửi', '0'],
];

export default function Home() {
  return (
    <main>
      <aside><h1>SalesMind AI</h1><nav>Dashboard<br/>Khách hàng<br/>Sản phẩm<br/>Chiến dịch<br/>Phê duyệt<br/>Agent Runs<br/>Báo cáo</nav></aside>
      <section>
        <header><div><small>MULTI-AGENT SALES SYSTEM</small><h2>Trung tâm điều hành bán hàng AI</h2></div><button>+ Thêm lead</button></header>
        <div className="grid">{cards.map(([name,value])=><article key={name}><span>{name}</span><strong>{value}</strong></article>)}</div>
        <div className="panel"><h3>Quy trình tự động</h3><p>Research Agent → Lead Scoring → Content Agent → Human Approval → Email Agent → CRM</p><div className="status">Hạ tầng đã sẵn sàng · Chờ cấu hình Gemini và Gmail</div></div>
      </section>
    </main>
  );
}
