/** Human-readable labels for tool calls, keyed by tool name. */
export const toolLabels: Record<string, { active: string; done: string }> = {
  contact_list:            { active: "Listing contacts",    done: "Listed contacts" },
  contact_lookup:          { active: "Looking up contact",  done: "Looked up contact" },
  contact_lookup_owner:    { active: "Looking up owner",    done: "Looked up owner" },
  contact_record:          { active: "Recording contact",   done: "Recorded contact" },
  contact_search:          { active: "Searching contacts",  done: "Searched contacts" },
  document_list:           { active: "Listing documents",   done: "Listed documents" },
  document_read:           { active: "Reading document",    done: "Read document" },
  document_write:          { active: "Writing document",    done: "Wrote document" },
  email_send:              { active: "Sending email",       done: "Sent email" },
  follow_up:               { active: "Following up",        done: "Followed up" },
  http_get:                { active: "Fetching URL",        done: "Fetched URL" },
  thread_list:             { active: "Listing threads",     done: "Listed threads" },
  thread_read:             { active: "Reading thread",      done: "Read thread" },
  thread_search:           { active: "Searching threads",   done: "Searched threads" },
  thread_summary_expand:   { active: "Expanding summary",   done: "Expanded summary" },
};
