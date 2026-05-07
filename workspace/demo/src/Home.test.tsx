import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Home } from "./Home";
import { championsLeagueData } from "./data/championsLeague";
import { worldCupData } from "./data/worldCup";

describe("Home", () => {
  it("renders the football schedule board base structure", () => {
    const html = renderToStaticMarkup(<Home />);

    assert.match(html, /欧冠与世界杯赛程及结果/);
    assert.match(html, /2026 世界杯/);
    assert.match(html, /2025-26 欧冠/);
    assert.match(html, /赛程状态/);
    assert.match(html, /结果待录入|未开赛|已结束|待官方确认/);
  });

  it("hides the old attachment failure notice completely", () => {
    const html = renderToStaticMarkup(<Home />);

    assert.doesNotMatch(html, /附件解析失败/);
    assert.doesNotMatch(html, /PDF 只解析到页码或空白表格/);
  });

  it("renders complete world cup data with 104 matches and correct groups", () => {
    const html = renderToStaticMarkup(<Home />);

    // 校验赛程总数
    assert.equal(worldCupData.matches.length, 104);
    assert.match(html, /收录场次<\/span><strong>104/);

    // 校验所有分组正确
    assert.match(html, /A组[\s\S]*墨西哥、南非、韩国、捷克/);
    assert.match(html, /B组[\s\S]*加拿大、瑞士、卡塔尔、波黑/);
    assert.match(html, /C组[\s\S]*巴西、摩洛哥、海地、苏格兰/);
    assert.match(html, /D组[\s\S]*美国、巴拉圭、澳大利亚、土耳其/);
    assert.match(html, /E组[\s\S]*德国、库拉索、科特迪瓦、厄瓜多尔/);
    assert.match(html, /F组[\s\S]*荷兰、日本、突尼斯、瑞典/);
    assert.match(html, /G组[\s\S]*比利时、埃及、伊朗、新西兰/);
    assert.match(html, /H组[\s\S]*西班牙、佛得角、沙特阿拉伯、乌拉圭/);
    assert.match(html, /I组[\s\S]*法国、塞内加尔、挪威、伊拉克/);
    assert.match(html, /J组[\s\S]*阿根廷、阿尔及利亚、奥地利、约旦/);
    assert.match(html, /K组[\s\S]*葡萄牙、乌兹别克斯坦、哥伦比亚、刚果民主共和国/);
    assert.match(html, /L组[\s\S]*英格兰、克罗地亚、加纳、巴拿马/);

    // 校验关键场次
    assert.match(html, /第1场[\s\S]*墨西哥[\s\S]*南非[\s\S]*阿兹特克体育场/);
    assert.match(html, /第104场[\s\S]*决赛[\s\S]*大都会人寿体育场/);

    // 校验赛制说明
    assert.match(html, /赛事时间为2026-06-11至2026-07-19/);
    assert.match(html, /48支球队分成12个小组/);
    assert.match(html, /总计104场比赛/);
    assert.match(html, /加拿大、墨西哥、美国共16个承办城市/);
  });

  it("renders complete champions league core data correctly", () => {
    const html = renderToStaticMarkup(<Home />);

    // 校验基础统计
    assert.equal(championsLeagueData.totalGoals, 652);
    assert.equal(championsLeagueData.avgGoals, 3.47);
    assert.match(html, /总进球：652个/);
    assert.match(html, /场均进球：3.47球/);

    // 校验射手榜
    assert.equal(championsLeagueData.scorers[0]?.player, "基利安-姆巴佩");
    assert.equal(championsLeagueData.scorers[0]?.value, 15);
    assert.equal(championsLeagueData.scorers[1]?.player, "哈里-凯恩");
    assert.equal(championsLeagueData.scorers[1]?.value, 13);
    assert.ok(championsLeagueData.scorers.some(item => item.player === "朱利安-阿尔瓦雷斯" && item.value === 10));
    assert.ok(championsLeagueData.scorers.some(item => item.player === "安东尼-戈登" && item.value === 10));
    assert.ok(championsLeagueData.scorers.some(item => item.player === "赫维恰-克瓦拉茨赫利亚" && item.value === 10));
    assert.ok(championsLeagueData.scorers.some(item => item.player === "埃尔林-哈兰德" && item.value === 8));
    assert.match(html, /哈兰德.*曼城.*8球/);

    // 校验助攻榜
    assert.ok(championsLeagueData.assists.some(item => item.player === "迈克尔-奥利塞" && item.value === 8));
    assert.ok(championsLeagueData.assists.some(item => item.player === "维尼修斯" && item.value === 8));
    assert.ok(championsLeagueData.assists.some(item => item.player === "赫维恰-克瓦拉茨赫利亚" && item.value === 6));
    assert.ok(championsLeagueData.assists.some(item => item.player === "阿什拉夫-哈基米" && item.value === 6));
    assert.ok(championsLeagueData.assists.some(item => item.player === "莱安德罗-特罗萨德" && item.value === 5));
    assert.ok(championsLeagueData.assists.some(item => item.player === "安托万-格列兹曼" && item.value === 5));
    assert.match(html, /奥利塞.*拜仁.*8次/);
    assert.match(html, /维尼修斯.*皇家马德里.*8次/);

    // 校验关键场次
    assert.ok(
      championsLeagueData.matches.some(
        match => match.home === "拜仁慕尼黑" && match.away === "巴黎圣日耳曼" && match.status === "toConfirm"
      )
    );
    assert.match(html, /拜仁慕尼黑.*巴黎圣日耳曼.*待官方确认/);
    
    assert.ok(
      championsLeagueData.matches.some(
        match => match.stage === "决赛" && match.home === "阿森纳" && match.away.includes("巴黎圣日耳曼 / 拜仁慕尼黑")
      )
    );
    assert.match(html, /阿森纳.*巴黎圣日耳曼 \/ 拜仁慕尼黑.*普斯卡什竞技场/);

    // 校验球队统计
    assert.ok(championsLeagueData.teamStats.some(item => item.name === "巴黎圣日耳曼" && item.goals === 44));
    assert.ok(championsLeagueData.teamStats.some(item => item.name === "拜仁慕尼黑" && item.goals === 42));
    assert.ok(championsLeagueData.teamStats.some(item => item.name === "阿森纳" && item.cleanSheets === 9));
    assert.match(html, /球队进球榜/);
    assert.match(html, /零封榜/);
  });

  it("renders complete data source description at page bottom", () => {
    const html = renderToStaticMarkup(<Home />);

    assert.match(html, /数据来源与核对说明/);
    assert.match(html, /UEFA\.com官方文章.*2025\/26 Champions League: All the fixtures and results/);
    assert.match(html, /UEFA\.com官方.*Tournament stats 2025\/26/);
    assert.match(html, /FIFA World Cup 26官方赛程入口与官方赛程PDF/);
    assert.match(html, /Roadtrips.*2026 World Cup Schedule - USA, Canada and Mexico/);
    assert.match(html, /临场观赛、购票或转播提醒请以UEFA\/FIFA最终公告为准/);
  });

  it("supports text selection for all content", () => {
    // 校验全局样式允许文本选择
    const css = require('fs').readFileSync(require.resolve('./styles.css'), 'utf8');
    assert.match(css, /user-select:\s*text/);
  });
});
