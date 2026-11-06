export interface DomainRow {
  id: string;
  name: string;
  created_at: string;
}

export interface InboxRow {
  id: string;
  domain_id: string;
  local_part: string;
  address: string;
  token_hash: string;
  created_at: string;
  expires_at: string;
  message_count: number;
}

export interface CreateInboxResult {
  id: string;
  email: string;
  token: string;
  expires_at: string;
  local_part: string;
}

export interface InboxPublic {
  id: string;
  email: string;
  expires_at: string;
  message_count: number;
  created_at: string;
}

export interface LegacyMessage {
  id: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  text: string;
  html: string;
}
