export type SelectorBindings = Record<string, number>;

export interface NamespaceInput {
  payload: any;
  meta: any;
  pre: Record<string, any>;
}

export type InputKind = "json" | "xml";

export interface MatchedInfo {
  ruleIndex: number;
  mappingPath: string;
  selector?: SelectorBindings;
}
