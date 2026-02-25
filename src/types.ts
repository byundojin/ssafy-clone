export interface Assignment {
  id: string;
  name: string;
  type: string;       // 과제 | 실습
  detailUrl: string;
  gitlabUrl?: string;
}

export interface Chapter {
  id: string;
  name: string;
  assignments: Assignment[];
}

export interface Course {
  id: string;
  name: string;
  chapters: Chapter[];
}
