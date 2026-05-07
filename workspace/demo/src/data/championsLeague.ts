import type { ChampionsLeagueData } from "../types";

export const championsLeagueData: ChampionsLeagueData = {
  stageSchedules: [
    {
      name: "资格赛第一轮",
      drawDate: "2025-06-17",
      firstLegDate: "2025-07-08/09",
      secondLegDate: "2025-07-15/16"
    },
    {
      name: "资格赛第二轮",
      drawDate: "2025-06-18",
      firstLegDate: "2025-07-22/23",
      secondLegDate: "2025-07-29/30"
    },
    {
      name: "资格赛第三轮",
      drawDate: "2025-07-21",
      firstLegDate: "2025-08-05/06",
      secondLegDate: "2025-08-12"
    },
    {
      name: "附加赛轮",
      drawDate: "2025-08-04",
      firstLegDate: "2025-08-19/20",
      secondLegDate: "2025-08-26/27"
    },
    {
      name: "联赛阶段",
      drawDate: "2025-08-28",
      firstLegDate: "2025-09-16",
      secondLegDate: "2026-01-28",
      remark: "36队参赛，共8轮"
    },
    {
      name: "淘汰赛附加赛",
      drawDate: "2026-01-30",
      firstLegDate: "2026-02-17/18",
      secondLegDate: "2026-02-24/25"
    },
    {
      name: "1/8决赛",
      drawDate: "2026-02-27",
      firstLegDate: "2026-03-10/11",
      secondLegDate: "2026-03-17/18"
    },
    {
      name: "1/4决赛",
      firstLegDate: "2026-04-07/08",
      secondLegDate: "2026-04-14/15"
    },
    {
      name: "半决赛",
      firstLegDate: "2026-04-28/29",
      secondLegDate: "2026-05-05/06"
    },
    {
      name: "决赛",
      firstLegDate: "2026-05-30",
      remark: "匈牙利布达佩斯普斯卡什竞技场，开球时间18:00 CET"
    }
  ],
  scorers: [
    { rank: 1, player: "基利安-姆巴佩", team: "皇家马德里", value: 15 },
    { rank: 2, player: "哈里-凯恩", team: "拜仁慕尼黑", value: 13 },
    { rank: 3, player: "朱利安-阿尔瓦雷斯", team: "马德里竞技", value: 10 },
    { rank: 3, player: "安东尼-戈登", team: "纽卡斯尔联", value: 10 },
    { rank: 3, player: "赫维恰-克瓦拉茨赫利亚", team: "巴黎圣日耳曼", value: 10 },
    { rank: 6, player: "埃尔林-哈兰德", team: "曼城", value: 8 }
  ],
  assists: [
    { rank: 1, player: "迈克尔-奥利塞", team: "拜仁慕尼黑", value: 8 },
    { rank: 1, player: "维尼修斯", team: "皇家马德里", value: 8 },
    { rank: 3, player: "赫维恰-克瓦拉茨赫利亚", team: "巴黎圣日耳曼", value: 6 },
    { rank: 3, player: "阿什拉夫-哈基米", team: "巴黎圣日耳曼", value: 6 },
    { rank: 5, player: "莱安德罗-特罗萨德", team: "阿森纳", value: 5 },
    { rank: 5, player: "安托万-格列兹曼", team: "马德里竞技", value: 5 }
  ],
  totalGoals: 652,
  avgGoals: 3.47,
  teamStats: [
    { name: "巴黎圣日耳曼", goals: 44, cleanSheets: 6 },
    { name: "拜仁慕尼黑", goals: 42, cleanSheets: 5 },
    { name: "马德里竞技", goals: 35, cleanSheets: 0 },
    { name: "皇家马德里", goals: 33, cleanSheets: 0 },
    { name: "巴塞罗那", goals: 32, cleanSheets: 0 },
    { name: "纽卡斯尔联", goals: 29, cleanSheets: 0 },
    { name: "阿森纳", goals: 0, cleanSheets: 9 },
    { name: "热刺", goals: 0, cleanSheets: 6 },
    { name: "利物浦", goals: 0, cleanSheets: 5 },
    { name: "勒沃库森", goals: 0, cleanSheets: 5 }
  ],
  matches: [
    // 附加赛首回合
    {
      id: "ucl-playoff-1",
      stage: "附加赛首回合",
      date: "2026-02-17",
      time: "20:00 CET",
      home: "加拉塔萨雷",
      away: "尤文图斯",
      venue: "土耳其电信球场",
      status: "finished",
      score: "5-2"
    },
    {
      id: "ucl-playoff-2",
      stage: "附加赛首回合",
      date: "2026-02-17",
      time: "20:00 CET",
      home: "摩纳哥",
      away: "巴黎圣日耳曼",
      venue: "路易二世球场",
      status: "finished",
      score: "2-3"
    },
    // 1/8决赛首回合
    {
      id: "ucl-r16-1",
      stage: "1/8决赛首回合",
      date: "2026-03-11",
      time: "20:00 CET",
      home: "皇家马德里",
      away: "曼城",
      venue: "伯纳乌球场",
      status: "finished",
      score: "3-0"
    },
    // 1/4决赛
    {
      id: "ucl-qf-1",
      stage: "1/4决赛首回合",
      date: "2026-04-07",
      time: "20:00 CET",
      home: "皇家马德里",
      away: "拜仁慕尼黑",
      venue: "伯纳乌球场",
      status: "finished",
      score: "1-2"
    },
    {
      id: "ucl-qf-2",
      stage: "1/4决赛次回合",
      date: "2026-04-15",
      time: "20:00 CET",
      home: "拜仁慕尼黑",
      away: "皇家马德里",
      venue: "安联球场",
      status: "finished",
      score: "4-3"
    },
    // 半决赛
    {
      id: "ucl-sf-1",
      stage: "半决赛首回合",
      date: "2026-04-28",
      time: "20:00 CET",
      home: "巴黎圣日耳曼",
      away: "拜仁慕尼黑",
      venue: "王子公园球场",
      status: "finished",
      score: "5-4"
    },
    {
      id: "ucl-bayern-psg",
      stage: "半决赛次回合",
      date: "2026-05-06",
      time: "20:00 CET",
      home: "拜仁慕尼黑",
      away: "巴黎圣日耳曼",
      venue: "安联球场",
      status: "toConfirm"
    },
    {
      id: "ucl-sf-3",
      stage: "半决赛首回合",
      date: "2026-04-29",
      time: "20:00 CET",
      home: "马德里竞技",
      away: "阿森纳",
      venue: "万达大都会球场",
      status: "finished",
      score: "1-1"
    },
    {
      id: "ucl-sf-4",
      stage: "半决赛次回合",
      date: "2026-05-05",
      time: "20:00 CET",
      home: "阿森纳",
      away: "马德里竞技",
      venue: "酋长球场",
      status: "finished",
      score: "1-0"
    },
    // 决赛
    {
      id: "ucl-final",
      stage: "决赛",
      date: "2026-05-30",
      time: "18:00 CET",
      home: "阿森纳",
      away: "巴黎圣日耳曼 / 拜仁慕尼黑",
      venue: "普斯卡什竞技场 · 布达佩斯",
      status: "scheduled"
    }
  ]
};
