export type RuleParam = Record<string, any>;

export interface Rule {
  id: string | number;
  enable: boolean;
  match: string;
  type: string;
  param?: RuleParam;
}

export interface Project {
  id: string | number;
  name: string;
  enable: boolean;
  rules: Rule[];
}

export interface ConfigState {
  projects: Project[];
  https?: boolean;
  ignoreCertError?: boolean;
  inspect?: boolean;
  devtoolsURL?: string;
  [key: string]: any;
}
