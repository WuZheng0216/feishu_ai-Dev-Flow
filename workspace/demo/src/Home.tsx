import React, { useMemo, useState } from "react";
import { useDevflowPreviewBridge } from "./devflowPreviewBridge";
import type { TournamentKey, MatchStatus, UclTeamStat } from "./types";
import { championsLeagueData } from "./data/championsLeague";
import { worldCupData } from "./data/worldCup";

const statusLabels: Record<MatchStatus, string> = {
  scheduled: "未开赛",
  resultPending: "结果待录入",
  finished: "已结束",
  toConfirm: "待官方确认"
};

const tournaments = {
  worldCup: {
    label: "2026 世界杯",
    subtitle: "FIFA World Cup 2026 赛制说明、小组分组与104场完整赛程整理，纯文本易复制检索。",
    ...worldCupData
  },
  championsLeague: {
    label: "2025-26 欧冠",
    subtitle: "2025/26赛季UEFA Champions League 赛程、赛果与统计摘要，待确认结果会单独标注。",
    ...championsLeagueData,
    matches: [...championsLeagueData.matches]
  }
};

export function Home() {
  useDevflowPreviewBridge();
  const [activeTournament, setActiveTournament] = useState<TournamentKey>("worldCup");
  const tournament = tournaments[activeTournament];
  const stats = useMemo(() => {
    const matches = tournament.matches;
    const total = matches.length;
    const scheduled = matches.filter((match) => match.status === "scheduled").length;
    const resultPending = matches.filter((match) => match.status === "resultPending" || match.status === "toConfirm").length;
    return { total, scheduled, resultPending };
  }, [tournament]);

  return (
    <main className="scheduleShell" data-devflow-id="schedule-shell" data-devflow-file="src/Home.tsx">
      <section className="scheduleHero" data-devflow-id="schedule-hero" data-devflow-file="src/Home.tsx">
        <p className="eyebrow" data-devflow-id="schedule-eyebrow" data-devflow-file="src/Home.tsx">
          Fixture Board
        </p>
        <h1 data-devflow-id="schedule-title" data-devflow-file="src/Home.tsx">
          欧冠与世界杯赛程及结果
        </h1>
        <p className="lead" data-devflow-id="schedule-lead" data-devflow-file="src/Home.tsx">
          2025-26赛季欧冠赛程赛果、球员统计 + 2026世界杯完整104场赛程整理，纯文本易复制检索。
        </p>
      </section>

      <section
        className="tournamentTabs"
        aria-label="赛事切换"
        data-devflow-id="tournament-tabs"
        data-devflow-file="src/Home.tsx"
      >
        {(Object.keys(tournaments) as TournamentKey[]).map((key) => (
          <button
            className={key === activeTournament ? "tab active" : "tab"}
            data-devflow-id={`tab-${key}`}
            data-devflow-file="src/Home.tsx"
            key={key}
            type="button"
            onClick={() => setActiveTournament(key)}
          >
            {tournaments[key].label}
          </button>
        ))}
      </section>

      <section
        className="summaryGrid"
        aria-label="赛程状态"
        data-devflow-id="schedule-summary"
        data-devflow-file="src/Home.tsx"
      >
        <article>
          <span>当前赛事</span>
          <strong>{tournament.label}</strong>
        </article>
        <article>
          <span>收录场次</span>
          <strong>{stats.total}</strong>
        </article>
        <article>
          <span>未开赛</span>
          <strong>{stats.scheduled}</strong>
        </article>
        <article>
          <span>结果待确认</span>
          <strong>{stats.resultPending}</strong>
        </article>
      </section>

      <section className="scheduleBoard" data-devflow-id="schedule-board" data-devflow-file="src/Home.tsx">
        <div>
          <h2>{tournament.label}</h2>
          <p>{tournament.subtitle}</p>
        </div>

        {/* 欧冠专属板块：阶段日程 + 统计摘要 */}
        {activeTournament === "championsLeague" && (
          <div data-devflow-id="ucl-stats-section" data-devflow-file="src/Home.tsx">
            {/* 阶段日程总览 */}
            <div className="matchList" style={{ marginBottom: "24px" }}>
              <h3>阶段日程总览</h3>
              {(tournament as typeof championsLeagueData).stageSchedules.map((stage, idx) => (
                <div className="matchCard" key={idx}>
                  <div className="matchMeta">
                    <span>{stage.name}</span>
                    <strong>{stage.drawDate ? `抽签：${stage.drawDate}` : "无抽签"}</strong>
                    <small>
                      {stage.firstLegDate && `首回合：${stage.firstLegDate}`}
                      {stage.secondLegDate && ` | 次回合：${stage.secondLegDate}`}
                      {stage.remark && ` | ${stage.remark}`}
                    </small>
                  </div>
                </div>
              ))}
            </div>

            {/* 射手榜、助攻榜、球队统计 */}
            <div className="summaryGrid" style={{ gridTemplateColumns: "repeat(3, 1fr)", marginBottom: "24px" }}>
              <article>
                <span>射手榜</span>
                <div style={{ marginTop: "8px" }}>
                  {(tournament as typeof championsLeagueData).scorers.map((item) => (
                    <div key={`scorer-${item.rank}-${item.player}`} style={{ fontSize: "0.9rem", margin: "4px 0" }}>
                      {item.rank}. {item.player}（{item.team}）{item.value}球
                    </div>
                  ))}
                </div>
              </article>
              <article>
                <span>助攻榜</span>
                <div style={{ marginTop: "8px" }}>
                  {(tournament as typeof championsLeagueData).assists.map((item) => (
                    <div key={`assist-${item.rank}-${item.player}`} style={{ fontSize: "0.9rem", margin: "4px 0" }}>
                      {item.rank}. {item.player}（{item.team}）{item.value}次
                    </div>
                  ))}
                </div>
              </article>
              <article>
                <span>赛季统计</span>
                <div style={{ marginTop: "8px", fontSize: "0.9rem" }}>
                  <div>总进球：{(tournament as typeof championsLeagueData).totalGoals}个</div>
                  <div>场均进球：{(tournament as typeof championsLeagueData).avgGoals}球</div>
                  <div style={{ marginTop: "12px" }}>
                    <strong style={{ fontSize: "0.8rem", color: "#69766f" }}>球队进球榜TOP6</strong>
                    {(tournament as typeof championsLeagueData).teamStats
                      .sort((a: UclTeamStat, b: UclTeamStat) => b.goals - a.goals)
                      .slice(0, 6)
                      .map((team, idx) => (
                        <div key={`goal-${team.name}`} style={{ margin: "4px 0" }}>
                          {idx + 1}. {team.name} {team.goals}球
                        </div>
                      ))}
                  </div>
                  <div style={{ marginTop: "12px" }}>
                    <strong style={{ fontSize: "0.8rem", color: "#69766f" }}>零封榜TOP5</strong>
                    {(tournament as typeof championsLeagueData).teamStats
                      .sort((a: UclTeamStat, b: UclTeamStat) => b.cleanSheets - a.cleanSheets)
                      .slice(0, 5)
                      .map((team, idx) => (
                        <div key={`cs-${team.name}`} style={{ margin: "4px 0" }}>
                          {idx + 1}. {team.name} {team.cleanSheets}场
                        </div>
                      ))}
                  </div>
                </div>
              </article>
            </div>
          </div>
        )}

        {/* 世界杯专属板块：赛制说明 + 分组名单 */}
        {activeTournament === "worldCup" && (
          <div data-devflow-id="wc-info-section" data-devflow-file="src/Home.tsx">
            {/* 赛制说明 */}
            <div className="matchCard" style={{ marginBottom: "24px" }}>
              <div className="matchMeta">
                <span>赛制说明</span>
                {(tournament as typeof worldCupData).rules.map((rule, idx) => (
                  <p key={`rule-${idx}`} style={{ margin: "4px 0", color: "#17211d" }}>{rule.content}</p>
                ))}
              </div>
            </div>

            {/* 小组分组 */}
            <div style={{ marginBottom: "24px" }}>
              <h3>小组分组</h3>
              <div className="summaryGrid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                {(tournament as typeof worldCupData).groups.map((group) => (
                  <article key={`group-${group.name}`}>
                    <span>{group.name}</span>
                    <div style={{ marginTop: "8px", fontSize: "0.9rem" }}>
                      {group.teams.join("、")}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 赛程列表 */}
        <div className="matchList" data-devflow-id="match-list" data-devflow-file="src/Home.tsx">
          {tournament.matches.map((match) => (
            <article
              className={`matchCard ${match.status}`}
              key={match.id}
              data-devflow-id={`match-${match.id}`}
              data-devflow-file="src/Home.tsx"
            >
              <div className="matchMeta">
                <span>{match.stage} {match.matchNo ? `| ${match.matchNo}` : ""}</span>
                <strong>{match.date}</strong>
                <small>
                  {match.etTime && match.localTime ? (
                    <>ET {match.etTime} / 当地 {match.localTime} · {match.venue}</>
                  ) : (
                    <> {match.time} · {match.venue}</>
                  )}
                </small>
              </div>
              <div className="teams">
                <span>{match.home}</span>
                <b>VS</b>
                <span>{match.away}</span>
              </div>
              <div className="resultBox">
                <span>{statusLabels[match.status]}</span>
                <strong>
                  {match.score ?? 
                    (match.status === "scheduled" ? "未开赛" : 
                    match.status === "toConfirm" ? "待官方确认" : "比分待更新")}
                </strong>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* 数据来源说明 */}
      <section className="scheduleBoard" style={{ marginTop: "18px" }} data-devflow-id="data-sources" data-devflow-file="src/Home.tsx">
        <h3>数据来源与核对说明</h3>
        <p style={{ margin: "8px 0", fontSize: "0.95rem", color: "#5f6d66" }}>
          1. 欧冠赛程与结果：UEFA.com官方文章“2025/26 Champions League: All the fixtures and results”，页面标注更新时间为2026-05-06。<br />
          2. 欧冠统计：UEFA.com官方“Tournament stats 2025/26”页面，用于总进球、场均进球、射手榜、助攻榜、球队进球榜与零封榜等摘要。<br />
          3. 世界杯官方框架：FIFA World Cup 26官方赛程入口与官方赛程PDF，用于赛事日期、104场规模、小组/淘汰赛框架与官方编号核对。<br />
          4. 世界杯逐场信息：Roadtrips可访问的“2026 World Cup Schedule - USA, Canada and Mexico”完整赛程清单，用于日期、ET时间、当地时间、场馆和城市字段；并与FIFA官方赛程入口/官方PDF进行交叉核对。<br />
          5. 准确性说明：足球赛程、统计榜和开球时间可能因赛事组织方、转播安排或官方更新而变化。本文适合作为赛程整理版；临场观赛、购票或转播提醒请以UEFA/FIFA最终公告为准。
        </p>
      </section>
    </main>
  );
}
