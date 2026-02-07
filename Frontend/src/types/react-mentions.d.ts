declare module 'react-mentions' {
  import { Component, ReactNode } from 'react';

  export interface SuggestionDataItem {
    id: string;
    display: string;
    [key: string]: any;
  }

  export interface MentionData {
    id: string;
    display: string;
    [key: string]: any;
  }

  export interface MentionsInputProps {
    value: string;
    onChange: (e: any, newValue: string, newPlainTextValue: string, mentions: MentionData[]) => void;
    onKeyDown?: (e: React.KeyboardEvent) => void;
    placeholder?: string;
    disabled?: boolean;
    style?: any;
    allowSuggestionsAboveCursor?: boolean;
    inputRef?: (el: HTMLTextAreaElement | null) => void;
    children?: ReactNode;
  }

  export interface MentionProps {
    trigger: string;
    data: (query: string, callback: (items: SuggestionDataItem[]) => void) => void;
    displayTransform?: (id: string, display: string) => string;
    markup?: string;
    regex?: RegExp | string;
    renderSuggestion?: (entry: SuggestionDataItem) => ReactNode;
  }

  export class MentionsInput extends Component<MentionsInputProps> {}
  export class Mention extends Component<MentionProps> {}
}

