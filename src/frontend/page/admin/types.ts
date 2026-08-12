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

/** Rule as rendered by the UI: `param` collapsed into a single `to` string. */
export interface DisplayRule extends Omit<Rule, 'param'> {
  to: string;
}

export interface DisplayProject extends Omit<Project, 'rules'> {
  rules: DisplayRule[];
}

export interface ConfigState {
  activeProjects: Project[];
  projects: Project[];
  https?: boolean;
  ignoreCertError?: boolean;
  inspect?: boolean;
  devtoolsURL?: string;
  [key: string]: any;
}
