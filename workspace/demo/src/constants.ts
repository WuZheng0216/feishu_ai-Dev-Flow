import { MatchStatus } from "./types";

export const STATUS_LABELS: Record<MatchStatus, string> = {
  scheduled: "未开赛",
  resultPending: "结果待录入",
  finished: "已结束",
  toConfirm: "待官方确认"
};

export const UPDATE_DATE = "2026-05-07";

export const DATA_SOURCE_NOTICE = `数据来源与核对说明：
1. 欧冠赛程与结果：UEFA.com官方文章“2025/26 Champions League: All the fixtures and results”，更新时间为2026-05-06
2. 欧冠统计：UEFA.com官方“Tournament stats 2025/26”页面
3. 世界杯官方框架：FIFA World Cup 26官方赛程入口与官方赛程PDF
4. 世界杯逐场信息：Roadtrips可访问的“2026 World Cup Schedule - USA, Canada and Mexico”完整赛程清单
准确性说明：足球赛程、统计榜和开球时间可能因赛事组织方、转播安排或官方更新而变化。本文适合作为赛程整理版；临场观赛、购票或转播提醒请以UEFA/FIFA最终公告为准。`;
