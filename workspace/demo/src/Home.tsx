import React from "react";

const highlights = [
  {
    title: "AI Pipeline",
    description: "把需求分析、方案设计、代码生成、测试评审串成可观察的自动化流程。"
  },
  {
    title: "Human Review",
    description: "在方案审批和最终交付前保留人工决策，让 AI 输出始终可控。"
  },
  {
    title: "自动交付",
    description: "沉淀阶段产物、验证摘要和交付说明，为后续 MR 集成打基础。"
  }
];

export function Home() {
  return (
    <main className="demoShell">
      <section className="hero">
        <p className="eyebrow">DevFlow Demo Site</p>
        <h1>AI 驱动的需求交付流程</h1>
        <p className="lead">请为演示站点首页增加一个“比赛亮点”区域，包含三个卡片：AI Pipeline、Human Review、自动交付。要求视觉清晰、文案简短，并补充基础测试。</p>
        <button className="primaryAction">开始体验</button>
      </section>

      <section className="highlights" aria-label="比赛亮点">
        <div className="sectionHeader">
          <h2>比赛亮点</h2>
          <p>把演示重点压缩成评委一眼能看懂的三件事。</p>
        </div>
        <div className="highlightGrid">
          {highlights.map((item) => (
            <article className="highlightCard" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
