export type TournamentKey = "worldCup" | "championsLeague";
export type MatchStatus = "scheduled" | "resultPending" | "finished" | "toConfirm";

export interface Match {
  id: string;
  stage: string;
  date: string;
  time: string; // 欧冠字段：比赛时间
  home: string;
  away: string;
  venue: string;
  status: MatchStatus;
  score?: string;
  // 世界杯新增字段
  matchNo?: string; // 场次编号
  etTime?: string; // ET时间
  localTime?: string; // 当地时间
}

// 欧冠相关类型
export interface UclStageSchedule {
  name: string;
  drawDate?: string;
  firstLegDate?: string;
  secondLegDate?: string;
  remark?: string;
}

export interface UclStatItem {
  rank: number;
  player: string;
  team: string;
  value: number;
}

export interface UclTeamStat {
  name: string;
  goals: number;
  cleanSheets: number;
}

export interface ChampionsLeagueData {
  stageSchedules: UclStageSchedule[];
  scorers: UclStatItem[];
  assists: UclStatItem[];
  totalGoals: number;
  avgGoals: number;
  teamStats: UclTeamStat[];
  matches: Match[];
}

// 世界杯相关类型
export interface WcRule {
  content: string;
}

export interface WcGroup {
  name: string;
  teams: string[];
}

export interface WorldCupData {
  rules: WcRule[];
  groups: WcGroup[];
  matches: Match[];
}
