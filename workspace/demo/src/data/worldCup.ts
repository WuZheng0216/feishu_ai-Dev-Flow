import type { Match, WcGroup, WorldCupData } from "../types";

const worldCupGroups: WcGroup[] = [
  { name: "A组", teams: ["墨西哥", "南非", "韩国", "捷克"] },
  { name: "B组", teams: ["加拿大", "瑞士", "卡塔尔", "波黑"] },
  { name: "C组", teams: ["巴西", "摩洛哥", "海地", "苏格兰"] },
  { name: "D组", teams: ["美国", "巴拉圭", "澳大利亚", "土耳其"] },
  { name: "E组", teams: ["德国", "库拉索", "科特迪瓦", "厄瓜多尔"] },
  { name: "F组", teams: ["荷兰", "日本", "突尼斯", "瑞典"] },
  { name: "G组", teams: ["比利时", "埃及", "伊朗", "新西兰"] },
  { name: "H组", teams: ["西班牙", "佛得角", "沙特阿拉伯", "乌拉圭"] },
  { name: "I组", teams: ["法国", "塞内加尔", "挪威", "伊拉克"] },
  { name: "J组", teams: ["阿根廷", "阿尔及利亚", "奥地利", "约旦"] },
  { name: "K组", teams: ["葡萄牙", "乌兹别克斯坦", "哥伦比亚", "刚果民主共和国"] },
  { name: "L组", teams: ["英格兰", "克罗地亚", "加纳", "巴拿马"] }
];

const matches: Match[] = [
  // A组
  {
    id: "wc-1",
    matchNo: "第1场",
    stage: "小组赛 · A组",
    date: "2026-06-11",
    time: "15:00 ET",
    etTime: "15:00",
    localTime: "13:00",
    home: "墨西哥",
    away: "南非",
    venue: "阿兹特克体育场 · 墨西哥城",
    status: "scheduled"
  },
  {
    id: "wc-2",
    matchNo: "第2场",
    stage: "小组赛 · A组",
    date: "2026-06-11",
    time: "22:00 ET",
    etTime: "22:00",
    localTime: "20:00",
    home: "韩国",
    away: "捷克",
    venue: "阿克伦体育场 · 瓜达拉哈拉",
    status: "scheduled"
  },
  // B组
  {
    id: "wc-3",
    matchNo: "第3场",
    stage: "小组赛 · B组",
    date: "2026-06-12",
    time: "15:00 ET",
    etTime: "15:00",
    localTime: "15:00",
    home: "加拿大",
    away: "波黑",
    venue: "BMO球场 · 多伦多",
    status: "scheduled"
  },
  {
    id: "wc-8",
    matchNo: "第8场",
    stage: "小组赛 · B组",
    date: "2026-06-13",
    time: "15:00 ET",
    etTime: "15:00",
    localTime: "12:00",
    home: "卡塔尔",
    away: "瑞士",
    venue: "李维斯体育场 · 旧金山湾区",
    status: "scheduled"
  },
  // C组
  {
    id: "wc-7",
    matchNo: "第7场",
    stage: "小组赛 · C组",
    date: "2026-06-13",
    time: "18:00 ET",
    etTime: "18:00",
    localTime: "18:00",
    home: "巴西",
    away: "摩洛哥",
    venue: "大都会人寿体育场 · 纽约/新泽西",
    status: "scheduled"
  },
  // D组
  {
    id: "wc-4",
    matchNo: "第4场",
    stage: "小组赛 · D组",
    date: "2026-06-12",
    time: "21:00 ET",
    etTime: "21:00",
    localTime: "18:00",
    home: "美国",
    away: "巴拉圭",
    venue: "SoFi体育场 · 洛杉矶",
    status: "scheduled"
  },
  // E组
  {
    id: "wc-10",
    matchNo: "第10场",
    stage: "小组赛 · E组",
    date: "2026-06-14",
    time: "13:00 ET",
    etTime: "13:00",
    localTime: "12:00",
    home: "德国",
    away: "库拉索",
    venue: "NRG体育场 · 休斯敦",
    status: "scheduled"
  },
  // F组
  {
    id: "wc-11",
    matchNo: "第11场",
    stage: "小组赛 · F组",
    date: "2026-06-14",
    time: "16:00 ET",
    etTime: "16:00",
    localTime: "15:00",
    home: "荷兰",
    away: "日本",
    venue: "AT&T体育场 · 达拉斯",
    status: "scheduled"
  },
  // J组
  {
    id: "wc-19",
    matchNo: "第19场",
    stage: "小组赛 · J组",
    date: "2026-06-16",
    time: "21:00 ET",
    etTime: "21:00",
    localTime: "20:00",
    home: "阿根廷",
    away: "阿尔及利亚",
    venue: "箭头体育场 · 堪萨斯城",
    status: "scheduled"
  },
  // K组
  {
    id: "wc-23",
    matchNo: "第23场",
    stage: "小组赛 · K组",
    date: "2026-06-17",
    time: "13:00 ET",
    etTime: "13:00",
    localTime: "12:00",
    home: "葡萄牙",
    away: "刚果民主共和国",
    venue: "NRG体育场 · 休斯敦",
    status: "scheduled"
  },
  // L组
  {
    id: "wc-22",
    matchNo: "第22场",
    stage: "小组赛 · L组",
    date: "2026-06-17",
    time: "16:00 ET",
    etTime: "16:00",
    localTime: "15:00",
    home: "英格兰",
    away: "克罗地亚",
    venue: "AT&T体育场 · 达拉斯",
    status: "scheduled"
  },
  // 32强
  {
    id: "wc-73",
    matchNo: "第73场",
    stage: "32强淘汰赛",
    date: "2026-06-28",
    time: "15:00 ET",
    etTime: "15:00",
    localTime: "12:00",
    home: "A组第二名",
    away: "B组第二名",
    venue: "SoFi体育场 · 洛杉矶",
    status: "scheduled"
  },
  // 16强
  {
    id: "wc-89",
    matchNo: "第89场",
    stage: "16强淘汰赛",
    date: "2026-07-04",
    time: "17:00 ET",
    etTime: "17:00",
    localTime: "17:00",
    home: "第74场胜者",
    away: "第77场胜者",
    venue: "林肯金融球场 · 费城",
    status: "scheduled"
  },
  // 1/4决赛
  {
    id: "wc-97",
    matchNo: "第97场",
    stage: "1/4决赛",
    date: "2026-07-09",
    time: "16:00 ET",
    etTime: "16:00",
    localTime: "16:00",
    home: "第89场胜者",
    away: "第90场胜者",
    venue: "吉列体育场 · 波士顿",
    status: "scheduled"
  },
  // 半决赛
  {
    id: "wc-101",
    matchNo: "第101场",
    stage: "半决赛",
    date: "2026-07-14",
    time: "15:00 ET",
    etTime: "15:00",
    localTime: "14:00",
    home: "第97场胜者",
    away: "第98场胜者",
    venue: "AT&T体育场 · 达拉斯",
    status: "scheduled"
  },
  // 三四名决赛
  {
    id: "wc-103",
    matchNo: "第103场",
    stage: "三四名决赛",
    date: "2026-07-18",
    time: "17:00 ET",
    etTime: "17:00",
    localTime: "17:00",
    home: "第101场负者",
    away: "第102场负者",
    venue: "硬石体育场 · 迈阿密",
    status: "scheduled"
  },
  // 决赛
  {
    id: "wc-104",
    matchNo: "第104场",
    stage: "决赛",
    date: "2026-07-19",
    time: "15:00 ET",
    etTime: "15:00",
    localTime: "15:00",
    home: "第101场胜者",
    away: "第102场胜者",
    venue: "大都会人寿体育场 · 纽约/新泽西",
    status: "scheduled"
  }
];

export const worldCupData: WorldCupData = {
  rules: [
    {
      content:
        "赛事时间为2026-06-11至2026-07-19。48支球队分成12个小组，每组4队；每组前两名和8个成绩最好的小组第三进入32强。本届世界杯总计104场比赛，比赛地覆盖加拿大、墨西哥、美国共16个承办城市/赛区。"
    },
    {
      content:
        "ET指美国东部时间；“当地”指比赛地当地时间。若ET显示00:00，通常意味着该场在比赛地当地时间为前一日夜间，观赛和购票时应以FIFA官方售票/转播页面最终显示为准。"
    },
    {
      content:
        "小组赛采用“A组至L组”标注；淘汰赛对阵中的“第X场胜者/负者”沿用官方赛程编号逻辑。"
    }
  ],
  groups: worldCupGroups,
  matches
};
