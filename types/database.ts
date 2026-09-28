
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "ai_artifacts": {
                  Row: {
                    "content": string | null,"created_at": string,"error": string | null,"id": string,"input_hash": string | null,"input_source_ids": (string)[],"model": string,"prompt_version": string,"provider": string,"sermon_id": string | null,"source_id": string | null,"source_version_hash": string | null,"status": Database["public"]['Enums']["artifact_status"],"structured_content": Json | null,"type": Database["public"]['Enums']["artifact_type"],"updated_at": string,"usage": NonNullable<Json>,"user_id": string,"version": number
                  }
                  Insert: {
                    "content"?: string | null,"created_at"?: string,"error"?: string | null,"id"?: string,"input_hash"?: string | null,"input_source_ids"?: (string)[],"model": string,"prompt_version": string,"provider": string,"sermon_id"?: string | null,"source_id"?: string | null,"source_version_hash"?: string | null,"status"?: Database["public"]['Enums']["artifact_status"],"structured_content"?: Json | null,"type": Database["public"]['Enums']["artifact_type"],"updated_at"?: string,"usage"?: NonNullable<Json>,"user_id": string,"version"?: number
                  }
                  Update: {
                    "content"?: string | null,"created_at"?: string,"error"?: string | null,"id"?: string,"input_hash"?: string | null,"input_source_ids"?: (string)[],"model"?: string,"prompt_version"?: string,"provider"?: string,"sermon_id"?: string | null,"source_id"?: string | null,"source_version_hash"?: string | null,"status"?: Database["public"]['Enums']["artifact_status"],"structured_content"?: Json | null,"type"?: Database["public"]['Enums']["artifact_type"],"updated_at"?: string,"usage"?: NonNullable<Json>,"user_id"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_artifacts_sermon_id_fkey"
      columns: ["sermon_id"]
isOneToOne: false
      referencedRelation: "sermons"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_artifacts_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "sermon_sources"
      referencedColumns: ["id"]
    }
                  ]
                },"applications": {
                  Row: {
                    "completed_at": string | null,"created_at": string,"detail": string,"hidden": boolean,"id": string,"origin": Database["public"]['Enums']["item_origin"],"pack_artifact_id": string | null,"position": number,"sermon_id": string,"status": Database["public"]['Enums']["application_status"],"text": string,"updated_at": string,"user_edited": boolean,"user_id": string
                  }
                  Insert: {
                    "completed_at"?: string | null,"created_at"?: string,"detail"?: string,"hidden"?: boolean,"id"?: string,"origin"?: Database["public"]['Enums']["item_origin"],"pack_artifact_id"?: string | null,"position"?: number,"sermon_id": string,"status"?: Database["public"]['Enums']["application_status"],"text": string,"updated_at"?: string,"user_edited"?: boolean,"user_id"?: string
                  }
                  Update: {
                    "completed_at"?: string | null,"created_at"?: string,"detail"?: string,"hidden"?: boolean,"id"?: string,"origin"?: Database["public"]['Enums']["item_origin"],"pack_artifact_id"?: string | null,"position"?: number,"sermon_id"?: string,"status"?: Database["public"]['Enums']["application_status"],"text"?: string,"updated_at"?: string,"user_edited"?: boolean,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "applications_pack_artifact_id_fkey"
      columns: ["pack_artifact_id"]
isOneToOne: false
      referencedRelation: "ai_artifacts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "applications_sermon_id_fkey"
      columns: ["sermon_id"]
isOneToOne: false
      referencedRelation: "sermons"
      referencedColumns: ["id"]
    }
                  ]
                },"audio_sources": {
                  Row: {
                    "duration_seconds": number | null,"media_file_id": string | null,"sermon_id": string,"source_id": string,"user_id": string
                  }
                  Insert: {
                    "duration_seconds"?: number | null,"media_file_id"?: string | null,"sermon_id": string,"source_id": string,"user_id": string
                  }
                  Update: {
                    "duration_seconds"?: number | null,"media_file_id"?: string | null,"sermon_id"?: string,"source_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "audio_sources_media_file_id_fkey"
      columns: ["media_file_id"]
isOneToOne: false
      referencedRelation: "media_files"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "audio_sources_sermon_id_fkey"
      columns: ["sermon_id"]
isOneToOne: false
      referencedRelation: "sermons"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "audio_sources_source_id_fkey"
      columns: ["source_id"]
isOneToOne: true
      referencedRelation: "sermon_sources"
      referencedColumns: ["id"]
    }
                  ]
                },"chat_messages": {
                  Row: {
                    "answer": Json | null,"content": string,"created_at": string,"id": string,"model": string | null,"prompt_version": string | null,"provider": string | null,"role": string,"sermon_id": string | null,"status": string,"thread_id": string,"usage": NonNullable<Json>,"user_id": string
                  }
                  Insert: {
                    "answer"?: Json | null,"content": string,"created_at"?: string,"id"?: string,"model"?: string | null,"prompt_version"?: string | null,"provider"?: string | null,"role": string,"sermon_id"?: string | null,"status"?: string,"thread_id": string,"usage"?: NonNullable<Json>,"user_id": string
                  }
                  Update: {
                    "answer"?: Json | null,"content"?: string,"created_at"?: string,"id"?: string,"model"?: string | null,"prompt_version"?: string | null,"provider"?: string | null,"role"?: string,"sermon_id"?: string | null,"status"?: string,"thread_id"?: string,"usage"?: NonNullable<Json>,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "chat_messages_sermon_id_fkey"
      columns: ["sermon_id"]
isOneToOne: false
      referencedRelation: "sermons"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "chat_messages_thread_id_fkey"
      columns: ["thread_id"]
isOneToOne: false
      referencedRelation: "chat_threads"
      referencedColumns: ["id"]
    }
                  ]
                },"chat_threads": {
                  Row: {
                    "created_at": string,"id": string,"sermon_id": string | null,"title": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"sermon_id"?: string | null,"title"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"sermon_id"?: string | null,"title"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "chat_threads_sermon_id_fkey"
      columns: ["sermon_id"]
isOneToOne: false
      referencedRelation: "sermons"
      referencedColumns: ["id"]
    }
                  ]
                },"documents": {
                  Row: {
                    "extracted_text": string,"media_file_id": string | null,"page_count": number | null,"pages": NonNullable<Json>,"search_tsv": unknown,"sermon_id": string,"source_id": string,"title": string | null,"user_id": string
                  }
                  Insert: {
                    "extracted_text"?: string,"media_file_id"?: string | null,"page_count"?: number | null,"pages"?: NonNullable<Json>,"search_tsv"?: never,"sermon_id": string,"source_id": string,"title"?: string | null,"user_id": string
                  }
                  Update: {
                    "extracted_text"?: string,"media_file_id"?: string | null,"page_count"?: number | null,"pages"?: NonNullable<Json>,"search_tsv"?: never,"sermon_id"?: string,"source_id"?: string,"title"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "documents_media_file_id_fkey"
      columns: ["media_file_id"]
isOneToOne: false
      referencedRelation: "media_files"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "documents_sermon_id_fkey"
      columns: ["sermon_id"]
isOneToOne: false
      referencedRelation: "sermons"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "documents_source_id_fkey"
      columns: ["source_id"]
isOneToOne: true
      referencedRelation: "sermon_sources"
      referencedColumns: ["id"]
    }
                  ]
                },"illustrations": {
                  Row: {
                    "created_at": string,"hidden": boolean,"id": string,"kind": string,"origin": Database["public"]['Enums']["item_origin"],"pack_artifact_id": string | null,"position": number,"sermon_id": string,"summary": string,"timestamp_confidence": Database["public"]['Enums']["confidence_level"] | null,"timestamp_end": number | null,"timestamp_start": number | null,"title": string,"updated_at": string,"user_edited": boolean,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"hidden"?: boolean,"id"?: string,"kind"?: string,"origin"?: Database["public"]['Enums']["item_origin"],"pack_artifact_id"?: string | null,"position"?: number,"sermon_id": string,"summary"?: string,"timestamp_confidence"?: Database["public"]['Enums']["confidence_level"] | null,"timestamp_end"?: number | null,"timestamp_start"?: number | null,"title": string,"updated_at"?: string,"user_edited"?: boolean,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"hidden"?: boolean,"id"?: string,"kind"?: string,"origin"?: Database["public"]['Enums']["item_origin"],"pack_artifact_id"?: string | null,"position"?: number,"sermon_id"?: string,"summary"?: string,"timestamp_confidence"?: Database["public"]['Enums']["confidence_level"] | null,"timestamp_end"?: number | null,"timestamp_start"?: number | null,"title"?: string,"updated_at"?: string,"user_edited"?: boolean,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "illustrations_pack_artifact_id_fkey"
      columns: ["pack_artifact_id"]
isOneToOne: false
      referencedRelation: "ai_artifacts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "illustrations_sermon_id_fkey"
      columns: ["sermon_id"]
isOneToOne: false
      referencedRelation: "sermons"
      referencedColumns: ["id"]
    }
                  ]
                },"jobs": {
                  Row: {
                    "attempt_count": number,"completed_at": string | null,"created_at": string,"dedupe_key": string | null,"error_code": string | null,"id": string,"last_error": string | null,"locked_by": string | null,"locked_until": string | null,"max_attempts": number,"model": string | null,"payload": NonNullable<Json>,"priority": number,"progress": number,"prompt_version": string | null,"provider": string | null,"result": Json | null,"run_after": string,"sermon_id": string | null,"source_id": string | null,"stage": string | null,"started_at": string | null,"status": Database["public"]['Enums']["job_status"],"type": Database["public"]['Enums']["job_type"],"updated_at": string,"usage": NonNullable<Json>,"user_id": string
                  }
                  Insert: {
                    "attempt_count"?: number,"completed_at"?: string | null,"created_at"?: string,"dedupe_key"?: string | null,"error_code"?: string | null,"id"?: string,"last_error"?: string | null,"locked_by"?: string | null,"locked_until"?: string | null,"max_attempts"?: number,"model"?: string | null,"payload"?: NonNullable<Json>,"priority"?: number,"progress"?: number,"prompt_version"?: string | null,"provider"?: string | null,"result"?: Json | null,"run_after"?: string,"sermon_id"?: string | null,"source_id"?: string | null,"stage"?: string | null,"started_at"?: string | null,"status"?: Database["public"]['Enums']["job_status"],"type": Database["public"]['Enums']["job_type"],"updated_at"?: string,"usage"?: NonNullable<Json>,"user_id": string
                  }
                  Update: {
                    "attempt_count"?: number,"completed_at"?: string | null,"created_at"?: string,"dedupe_key"?: string | null,"error_code"?: string | null,"id"?: string,"last_error"?: string | null,"locked_by"?: string | null,"locked_until"?: string | null,"max_attempts"?: number,"model"?: string | null,"payload"?: NonNullable<Json>,"priority"?: number,"progress"?: number,"prompt_version"?: string | null,"provider"?: string | null,"result"?: Json | null,"run_after"?: string,"sermon_id"?: string | null,"source_id"?: string | null,"stage"?: string | null,"started_at"?: string | null,"status"?: Database["public"]['Enums']["job_status"],"type"?: Database["public"]['Enums']["job_type"],"updated_at"?: string,"usage"?: NonNullable<Json>,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "jobs_sermon_id_fkey"
      columns: ["sermon_id"]
isOneToOne: false
      referencedRelation: "sermons"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "jobs_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "sermon_sources"
      referencedColumns: ["id"]
    }
                  ]
                },"main_ideas": {
                  Row: {
                    "confidence": Database["public"]['Enums']["confidence_level"],"created_at": string,"explanation": string,"hidden": boolean,"id": string,"origin": Database["public"]['Enums']["item_origin"],"pack_artifact_id": string | null,"position": number,"scripture_refs": (string)[],"search_tsv": unknown,"sermon_id": string,"summary": string,"timestamp_confidence": Database["public"]['Enums']["confidence_level"] | null,"timestamp_end": number | null,"timestamp_start": number | null,"title": string,"updated_at": string,"user_edited": boolean,"user_id": string
                  }
                  Insert: {
                    "confidence"?: Database["public"]['Enums']["confidence_level"],"created_at"?: string,"explanation"?: string,"hidden"?: boolean,"id"?: string,"origin"?: Database["public"]['Enums']["item_origin"],"pack_artifact_id"?: string | null,"position"?: number,"scripture_refs"?: (string)[],"search_tsv"?: never,"sermon_id": string,"summary"?: string,"timestamp_confidence"?: Database["public"]['Enums']["confidence_level"] | null,"timestamp_end"?: number | null,"timestamp_start"?: number | null,"title": string,"updated_at"?: string,"user_edited"?: boolean,"user_id": string
                  }
                  Update: {
                    "confidence"?: Database["public"]['Enums']["confidence_level"],"created_at"?: string,"explanation"?: string,"hidden"?: boolean,"id"?: string,"origin"?: Database["public"]['Enums']["item_origin"],"pack_artifact_id"?: string | null,"position"?: number,"scripture_refs"?: (string)[],"search_tsv"?: never,"sermon_id"?: string,"summary"?: string,"timestamp_confidence"?: Database["public"]['Enums']["confidence_level"] | null,"timestamp_end"?: number | null,"timestamp_start"?: number | null,"title"?: string,"updated_at"?: string,"user_edited"?: boolean,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "main_ideas_pack_artifact_id_fkey"
      columns: ["pack_artifact_id"]
isOneToOne: false
      referencedRelation: "ai_artifacts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "main_ideas_sermon_id_fkey"
      columns: ["sermon_id"]
isOneToOne: false
      referencedRelation: "sermons"
      referencedColumns: ["id"]
    }
                  ]
                },"media_files": {
                  Row: {
                    "bucket": string,"created_at": string,"duration_seconds": number | null,"height": number | null,"id": string,"kind": Database["public"]['Enums']["media_kind"],"mime_type": string,"original_filename": string | null,"path": string,"rejection_reason": string | null,"rights_confirmed_at": string | null,"sermon_id": string,"sha256": string | null,"size_bytes": number,"source_id": string | null,"status": Database["public"]['Enums']["media_status"],"user_id": string,"verified_at": string | null,"width": number | null
                  }
                  Insert: {
                    "bucket": string,"created_at"?: string,"duration_seconds"?: number | null,"height"?: number | null,"id"?: string,"kind": Database["public"]['Enums']["media_kind"],"mime_type": string,"original_filename"?: string | null,"path": string,"rejection_reason"?: string | null,"rights_confirmed_at"?: string | null,"sermon_id": string,"sha256"?: string | null,"size_bytes": number,"source_id"?: string | null,"status"?: Database["public"]['Enums']["media_status"],"user_id": string,"verified_at"?: string | null,"width"?: number | null
                  }
                  Update: {
                    "bucket"?: string,"created_at"?: string,"duration_seconds"?: number | null,"height"?: number | null,"id"?: string,"kind"?: Database["public"]['Enums']["media_kind"],"mime_type"?: string,"original_filename"?: string | null,"path"?: string,"rejection_reason"?: string | null,"rights_confirmed_at"?: string | null,"sermon_id"?: string,"sha256"?: string | null,"size_bytes"?: number,"source_id"?: string | null,"status"?: Database["public"]['Enums']["media_status"],"user_id"?: string,"verified_at"?: string | null,"width"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "media_files_sermon_id_fkey"
      columns: ["sermon_id"]
isOneToOne: false
      referencedRelation: "sermons"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "media_files_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "sermon_sources"
      referencedColumns: ["id"]
    }
                  ]
                },"note_blocks": {
                  Row: {
                    "block_id": string,"block_type": string,"content_hash": string,"note_id": string,"position": number,"sermon_id": string,"text": string,"timestamp_seconds": number | null,"user_id": string
                  }
                  Insert: {
                    "block_id": string,"block_type": string,"content_hash": string,"note_id": string,"position": number,"sermon_id": string,"text": string,"timestamp_seconds"?: number | null,"user_id": string
                  }
                  Update: {
                    "block_id"?: string,"block_type"?: string,"content_hash"?: string,"note_id"?: string,"position"?: number,"sermon_id"?: string,"text"?: string,"timestamp_seconds"?: number | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "note_blocks_note_id_fkey"
      columns: ["note_id"]
isOneToOne: false
      referencedRelation: "notes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "note_blocks_sermon_id_fkey"
      columns: ["sermon_id"]
isOneToOne: false
      referencedRelation: "sermons"
      referencedColumns: ["id"]
    }
                  ]
                },"notes": {
                  Row: {
                    "client_updated_at": string | null,"content": NonNullable<Json>,"content_hash": string | null,"created_at": string,"id": string,"plain_text": string,"search_tsv": unknown,"sermon_id": string,"source_id": string,"title": string,"updated_at": string,"user_id": string,"version": number
                  }
                  Insert: {
                    "client_updated_at"?: string | null,"content"?: NonNullable<Json>,"content_hash"?: string | null,"created_at"?: string,"id"?: string,"plain_text"?: string,"search_tsv"?: never,"sermon_id": string,"source_id": string,"title"?: string,"updated_at"?: string,"user_id": string,"version"?: number
                  }
                  Update: {
                    "client_updated_at"?: string | null,"content"?: NonNullable<Json>,"content_hash"?: string | null,"created_at"?: string,"id"?: string,"plain_text"?: string,"search_tsv"?: never,"sermon_id"?: string,"source_id"?: string,"title"?: string,"updated_at"?: string,"user_id"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "notes_sermon_id_fkey"
      columns: ["sermon_id"]
isOneToOne: false
      referencedRelation: "sermons"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notes_source_id_fkey"
      columns: ["source_id"]
isOneToOne: true
      referencedRelation: "sermon_sources"
      referencedColumns: ["id"]
    }
                  ]
                },"ocr_extractions": {
                  Row: {
                    "artifact_id": string | null,"blocks": NonNullable<Json>,"created_at": string,"full_text": string,"id": string,"is_current": boolean,"legibility_note": string | null,"origin": Database["public"]['Enums']["item_origin"],"overall_confidence": Database["public"]['Enums']["confidence_level"] | null,"photo_kind": string | null,"photo_source_id": string,"search_tsv": unknown,"sermon_id": string,"title": string | null,"user_id": string,"version": number
                  }
                  Insert: {
                    "artifact_id"?: string | null,"blocks"?: NonNullable<Json>,"created_at"?: string,"full_text"?: string,"id"?: string,"is_current"?: boolean,"legibility_note"?: string | null,"origin": Database["public"]['Enums']["item_origin"],"overall_confidence"?: Database["public"]['Enums']["confidence_level"] | null,"photo_kind"?: string | null,"photo_source_id": string,"search_tsv"?: never,"sermon_id": string,"title"?: string | null,"user_id": string,"version": number
                  }
                  Update: {
                    "artifact_id"?: string | null,"blocks"?: NonNullable<Json>,"created_at"?: string,"full_text"?: string,"id"?: string,"is_current"?: boolean,"legibility_note"?: string | null,"origin"?: Database["public"]['Enums']["item_origin"],"overall_confidence"?: Database["public"]['Enums']["confidence_level"] | null,"photo_kind"?: string | null,"photo_source_id"?: string,"search_tsv"?: never,"sermon_id"?: string,"title"?: string | null,"user_id"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "ocr_artifact_fk"
      columns: ["artifact_id"]
isOneToOne: false
      referencedRelation: "ai_artifacts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ocr_extractions_photo_source_id_fkey"
      columns: ["photo_source_id"]
isOneToOne: false
      referencedRelation: "photos"
      referencedColumns: ["source_id"]
    },{
      foreignKeyName: "ocr_extractions_sermon_id_fkey"
      columns: ["sermon_id"]
isOneToOne: false
      referencedRelation: "sermons"
      referencedColumns: ["id"]
    }
                  ]
                },"photos": {
                  Row: {
                    "caption": string | null,"captured_at": string | null,"current_ocr_id": string | null,"height": number | null,"original_file_id": string,"preview_file_id": string | null,"sermon_id": string,"sermon_timestamp_seconds": number | null,"source_id": string,"user_id": string,"width": number | null
                  }
                  Insert: {
                    "caption"?: string | null,"captured_at"?: string | null,"current_ocr_id"?: string | null,"height"?: number | null,"original_file_id": string,"preview_file_id"?: string | null,"sermon_id": string,"sermon_timestamp_seconds"?: number | null,"source_id": string,"user_id": string,"width"?: number | null
                  }
                  Update: {
                    "caption"?: string | null,"captured_at"?: string | null,"current_ocr_id"?: string | null,"height"?: number | null,"original_file_id"?: string,"preview_file_id"?: string | null,"sermon_id"?: string,"sermon_timestamp_seconds"?: number | null,"source_id"?: string,"user_id"?: string,"width"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "photos_current_ocr_fk"
      columns: ["current_ocr_id"]
isOneToOne: false
      referencedRelation: "ocr_extractions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "photos_original_file_id_fkey"
      columns: ["original_file_id"]
isOneToOne: false
      referencedRelation: "media_files"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "photos_preview_file_id_fkey"
      columns: ["preview_file_id"]
isOneToOne: false
      referencedRelation: "media_files"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "photos_sermon_id_fkey"
      columns: ["sermon_id"]
isOneToOne: false
      referencedRelation: "sermons"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "photos_source_id_fkey"
      columns: ["source_id"]
isOneToOne: true
      referencedRelation: "sermon_sources"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"display_name": string | null,"id": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"display_name"?: string | null,"id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string | null,"id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"questions": {
                  Row: {
                    "answer": string | null,"answered_at": string | null,"captured_at": string | null,"client_id": string | null,"created_at": string,"for_group": boolean,"hidden": boolean,"id": string,"moment_id": string | null,"origin": Database["public"]['Enums']["item_origin"],"pack_artifact_id": string | null,"position": number,"sermon_id": string,"status": Database["public"]['Enums']["question_status"],"text": string,"timestamp_seconds": number | null,"updated_at": string,"user_edited": boolean,"user_id": string
                  }
                  Insert: {
                    "answer"?: string | null,"answered_at"?: string | null,"captured_at"?: string | null,"client_id"?: string | null,"created_at"?: string,"for_group"?: boolean,"hidden"?: boolean,"id"?: string,"moment_id"?: string | null,"origin"?: Database["public"]['Enums']["item_origin"],"pack_artifact_id"?: string | null,"position"?: number,"sermon_id": string,"status"?: Database["public"]['Enums']["question_status"],"text": string,"timestamp_seconds"?: number | null,"updated_at"?: string,"user_edited"?: boolean,"user_id"?: string
                  }
                  Update: {
                    "answer"?: string | null,"answered_at"?: string | null,"captured_at"?: string | null,"client_id"?: string | null,"created_at"?: string,"for_group"?: boolean,"hidden"?: boolean,"id"?: string,"moment_id"?: string | null,"origin"?: Database["public"]['Enums']["item_origin"],"pack_artifact_id"?: string | null,"position"?: number,"sermon_id"?: string,"status"?: Database["public"]['Enums']["question_status"],"text"?: string,"timestamp_seconds"?: number | null,"updated_at"?: string,"user_edited"?: boolean,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "questions_moment_id_fkey"
      columns: ["moment_id"]
isOneToOne: false
      referencedRelation: "sermon_moments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "questions_pack_artifact_id_fkey"
      columns: ["pack_artifact_id"]
isOneToOne: false
      referencedRelation: "ai_artifacts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "questions_sermon_id_fkey"
      columns: ["sermon_id"]
isOneToOne: false
      referencedRelation: "sermons"
      referencedColumns: ["id"]
    }
                  ]
                },"quotes": {
                  Row: {
                    "attributed_to": string | null,"confidence": Database["public"]['Enums']["confidence_level"],"context": string,"created_at": string,"hidden": boolean,"id": string,"origin": Database["public"]['Enums']["item_origin"],"pack_artifact_id": string | null,"position": number,"quote_type": Database["public"]['Enums']["quote_type"],"search_tsv": unknown,"sermon_id": string,"text": string,"timestamp_confidence": Database["public"]['Enums']["confidence_level"] | null,"timestamp_start": number | null,"updated_at": string,"user_edited": boolean,"user_id": string,"verbatim_evidence": string | null
                  }
                  Insert: {
                    "attributed_to"?: string | null,"confidence"?: Database["public"]['Enums']["confidence_level"],"context"?: string,"created_at"?: string,"hidden"?: boolean,"id"?: string,"origin"?: Database["public"]['Enums']["item_origin"],"pack_artifact_id"?: string | null,"position"?: number,"quote_type"?: Database["public"]['Enums']["quote_type"],"search_tsv"?: never,"sermon_id": string,"text": string,"timestamp_confidence"?: Database["public"]['Enums']["confidence_level"] | null,"timestamp_start"?: number | null,"updated_at"?: string,"user_edited"?: boolean,"user_id": string,"verbatim_evidence"?: string | null
                  }
                  Update: {
                    "attributed_to"?: string | null,"confidence"?: Database["public"]['Enums']["confidence_level"],"context"?: string,"created_at"?: string,"hidden"?: boolean,"id"?: string,"origin"?: Database["public"]['Enums']["item_origin"],"pack_artifact_id"?: string | null,"position"?: number,"quote_type"?: Database["public"]['Enums']["quote_type"],"search_tsv"?: never,"sermon_id"?: string,"text"?: string,"timestamp_confidence"?: Database["public"]['Enums']["confidence_level"] | null,"timestamp_start"?: number | null,"updated_at"?: string,"user_edited"?: boolean,"user_id"?: string,"verbatim_evidence"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "quotes_pack_artifact_id_fkey"
      columns: ["pack_artifact_id"]
isOneToOne: false
      referencedRelation: "ai_artifacts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quotes_sermon_id_fkey"
      columns: ["sermon_id"]
isOneToOne: false
      referencedRelation: "sermons"
      referencedColumns: ["id"]
    }
                  ]
                },"rate_limits": {
                  Row: {
                    "bucket": string,"count": number,"user_id": string,"window_start": string
                  }
                  Insert: {
                    "bucket": string,"count"?: number,"user_id": string,"window_start": string
                  }
                  Update: {
                    "bucket"?: string,"count"?: number,"user_id"?: string,"window_start"?: string
                  }
                  Relationships: [
                    
                  ]
                },"review_items": {
                  Row: {
                    "created_at": string,"detail": string,"due_on": string | null,"id": string,"kind": Database["public"]['Enums']["review_kind"],"last_reviewed_at": string | null,"origin": Database["public"]['Enums']["item_origin"],"pack_artifact_id": string | null,"position": number,"prompt": string,"sermon_id": string,"status": Database["public"]['Enums']["review_status"],"times_reviewed": number,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"detail"?: string,"due_on"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["review_kind"],"last_reviewed_at"?: string | null,"origin"?: Database["public"]['Enums']["item_origin"],"pack_artifact_id"?: string | null,"position"?: number,"prompt": string,"sermon_id": string,"status"?: Database["public"]['Enums']["review_status"],"times_reviewed"?: number,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"detail"?: string,"due_on"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["review_kind"],"last_reviewed_at"?: string | null,"origin"?: Database["public"]['Enums']["item_origin"],"pack_artifact_id"?: string | null,"position"?: number,"prompt"?: string,"sermon_id"?: string,"status"?: Database["public"]['Enums']["review_status"],"times_reviewed"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "review_items_pack_artifact_id_fkey"
      columns: ["pack_artifact_id"]
isOneToOne: false
      referencedRelation: "ai_artifacts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "review_items_sermon_id_fkey"
      columns: ["sermon_id"]
isOneToOne: false
      referencedRelation: "sermons"
      referencedColumns: ["id"]
    }
                  ]
                },"scripture_references": {
                  Row: {
                    "book": string,"chapter_end": number | null,"chapter_start": number | null,"client_id": string | null,"confidence": Database["public"]['Enums']["confidence_level"],"created_at": string,"hidden": boolean,"id": string,"kind": Database["public"]['Enums']["scripture_kind"],"normalized_reference": string,"origin": Database["public"]['Enums']["item_origin"],"osis": string,"pack_artifact_id": string | null,"position": number,"reference_text": string,"role": string,"sermon_context": string,"sermon_id": string,"timestamp_confidence": Database["public"]['Enums']["confidence_level"] | null,"timestamp_start": number | null,"updated_at": string,"user_edited": boolean,"user_id": string,"verse_end": number | null,"verse_start": number | null
                  }
                  Insert: {
                    "book": string,"chapter_end"?: number | null,"chapter_start"?: number | null,"client_id"?: string | null,"confidence"?: Database["public"]['Enums']["confidence_level"],"created_at"?: string,"hidden"?: boolean,"id"?: string,"kind"?: Database["public"]['Enums']["scripture_kind"],"normalized_reference": string,"origin"?: Database["public"]['Enums']["item_origin"],"osis": string,"pack_artifact_id"?: string | null,"position"?: number,"reference_text": string,"role"?: string,"sermon_context"?: string,"sermon_id": string,"timestamp_confidence"?: Database["public"]['Enums']["confidence_level"] | null,"timestamp_start"?: number | null,"updated_at"?: string,"user_edited"?: boolean,"user_id"?: string,"verse_end"?: number | null,"verse_start"?: number | null
                  }
                  Update: {
                    "book"?: string,"chapter_end"?: number | null,"chapter_start"?: number | null,"client_id"?: string | null,"confidence"?: Database["public"]['Enums']["confidence_level"],"created_at"?: string,"hidden"?: boolean,"id"?: string,"kind"?: Database["public"]['Enums']["scripture_kind"],"normalized_reference"?: string,"origin"?: Database["public"]['Enums']["item_origin"],"osis"?: string,"pack_artifact_id"?: string | null,"position"?: number,"reference_text"?: string,"role"?: string,"sermon_context"?: string,"sermon_id"?: string,"timestamp_confidence"?: Database["public"]['Enums']["confidence_level"] | null,"timestamp_start"?: number | null,"updated_at"?: string,"user_edited"?: boolean,"user_id"?: string,"verse_end"?: number | null,"verse_start"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "scripture_references_pack_artifact_id_fkey"
      columns: ["pack_artifact_id"]
isOneToOne: false
      referencedRelation: "ai_artifacts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "scripture_references_sermon_id_fkey"
      columns: ["sermon_id"]
isOneToOne: false
      referencedRelation: "sermons"
      referencedColumns: ["id"]
    }
                  ]
                },"sermon_moments": {
                  Row: {
                    "captured_at": string | null,"category": Database["public"]['Enums']["moment_category"],"client_id": string | null,"created_at": string,"description": string,"hidden": boolean,"id": string,"origin": Database["public"]['Enums']["item_origin"],"original_timestamp_start": number | null,"pack_artifact_id": string | null,"position": number,"sermon_id": string,"timestamp_confidence": Database["public"]['Enums']["confidence_level"] | null,"timestamp_end": number | null,"timestamp_source": Database["public"]['Enums']["timestamp_source"],"timestamp_start": number | null,"title": string,"updated_at": string,"user_edited": boolean,"user_id": string,"verification_status": Database["public"]['Enums']["verification_status"]
                  }
                  Insert: {
                    "captured_at"?: string | null,"category": Database["public"]['Enums']["moment_category"],"client_id"?: string | null,"created_at"?: string,"description"?: string,"hidden"?: boolean,"id"?: string,"origin"?: Database["public"]['Enums']["item_origin"],"original_timestamp_start"?: number | null,"pack_artifact_id"?: string | null,"position"?: number,"sermon_id": string,"timestamp_confidence"?: Database["public"]['Enums']["confidence_level"] | null,"timestamp_end"?: number | null,"timestamp_source"?: Database["public"]['Enums']["timestamp_source"],"timestamp_start"?: number | null,"title"?: string,"updated_at"?: string,"user_edited"?: boolean,"user_id"?: string,"verification_status"?: Database["public"]['Enums']["verification_status"]
                  }
                  Update: {
                    "captured_at"?: string | null,"category"?: Database["public"]['Enums']["moment_category"],"client_id"?: string | null,"created_at"?: string,"description"?: string,"hidden"?: boolean,"id"?: string,"origin"?: Database["public"]['Enums']["item_origin"],"original_timestamp_start"?: number | null,"pack_artifact_id"?: string | null,"position"?: number,"sermon_id"?: string,"timestamp_confidence"?: Database["public"]['Enums']["confidence_level"] | null,"timestamp_end"?: number | null,"timestamp_source"?: Database["public"]['Enums']["timestamp_source"],"timestamp_start"?: number | null,"title"?: string,"updated_at"?: string,"user_edited"?: boolean,"user_id"?: string,"verification_status"?: Database["public"]['Enums']["verification_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "sermon_moments_pack_artifact_id_fkey"
      columns: ["pack_artifact_id"]
isOneToOne: false
      referencedRelation: "ai_artifacts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sermon_moments_sermon_id_fkey"
      columns: ["sermon_id"]
isOneToOne: false
      referencedRelation: "sermons"
      referencedColumns: ["id"]
    }
                  ]
                },"sermon_sections": {
                  Row: {
                    "created_at": string,"hidden": boolean,"id": string,"origin": Database["public"]['Enums']["item_origin"],"pack_artifact_id": string | null,"position": number,"sermon_id": string,"summary": string,"timestamp_confidence": Database["public"]['Enums']["confidence_level"] | null,"timestamp_end": number | null,"timestamp_start": number | null,"title": string,"updated_at": string,"user_edited": boolean,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"hidden"?: boolean,"id"?: string,"origin"?: Database["public"]['Enums']["item_origin"],"pack_artifact_id"?: string | null,"position"?: number,"sermon_id": string,"summary"?: string,"timestamp_confidence"?: Database["public"]['Enums']["confidence_level"] | null,"timestamp_end"?: number | null,"timestamp_start"?: number | null,"title": string,"updated_at"?: string,"user_edited"?: boolean,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"hidden"?: boolean,"id"?: string,"origin"?: Database["public"]['Enums']["item_origin"],"pack_artifact_id"?: string | null,"position"?: number,"sermon_id"?: string,"summary"?: string,"timestamp_confidence"?: Database["public"]['Enums']["confidence_level"] | null,"timestamp_end"?: number | null,"timestamp_start"?: number | null,"title"?: string,"updated_at"?: string,"user_edited"?: boolean,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sermon_sections_pack_artifact_id_fkey"
      columns: ["pack_artifact_id"]
isOneToOne: false
      referencedRelation: "ai_artifacts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sermon_sections_sermon_id_fkey"
      columns: ["sermon_id"]
isOneToOne: false
      referencedRelation: "sermons"
      referencedColumns: ["id"]
    }
                  ]
                },"sermon_sources": {
                  Row: {
                    "content_hash": string | null,"created_at": string,"error_code": string | null,"error_message": string | null,"id": string,"label": string,"ordinal": number,"processed_at": string | null,"sermon_id": string,"source_type": Database["public"]['Enums']["source_type"],"status": Database["public"]['Enums']["source_status"],"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "content_hash"?: string | null,"created_at"?: string,"error_code"?: string | null,"error_message"?: string | null,"id"?: string,"label": string,"ordinal"?: number,"processed_at"?: string | null,"sermon_id": string,"source_type": Database["public"]['Enums']["source_type"],"status"?: Database["public"]['Enums']["source_status"],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "content_hash"?: string | null,"created_at"?: string,"error_code"?: string | null,"error_message"?: string | null,"id"?: string,"label"?: string,"ordinal"?: number,"processed_at"?: string | null,"sermon_id"?: string,"source_type"?: Database["public"]['Enums']["source_type"],"status"?: Database["public"]['Enums']["source_status"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sermon_sources_sermon_id_fkey"
      columns: ["sermon_id"]
isOneToOne: false
      referencedRelation: "sermons"
      referencedColumns: ["id"]
    }
                  ]
                },"sermons": {
                  Row: {
                    "big_idea": string | null,"central_thesis": string | null,"church": string | null,"corrected_fields": (string)[],"created_at": string,"current_pack_id": string | null,"detailed_summary": string | null,"finished_at": string | null,"id": string,"last_opened_at": string | null,"metadata_suggestions": NonNullable<Json>,"pack_stale": boolean,"preached_on": string | null,"search_tsv": unknown,"series": string | null,"short_summary": string | null,"speaker": string | null,"status": Database["public"]['Enums']["sermon_status"],"title": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "big_idea"?: string | null,"central_thesis"?: string | null,"church"?: string | null,"corrected_fields"?: (string)[],"created_at"?: string,"current_pack_id"?: string | null,"detailed_summary"?: string | null,"finished_at"?: string | null,"id"?: string,"last_opened_at"?: string | null,"metadata_suggestions"?: NonNullable<Json>,"pack_stale"?: boolean,"preached_on"?: string | null,"search_tsv"?: never,"series"?: string | null,"short_summary"?: string | null,"speaker"?: string | null,"status"?: Database["public"]['Enums']["sermon_status"],"title"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "big_idea"?: string | null,"central_thesis"?: string | null,"church"?: string | null,"corrected_fields"?: (string)[],"created_at"?: string,"current_pack_id"?: string | null,"detailed_summary"?: string | null,"finished_at"?: string | null,"id"?: string,"last_opened_at"?: string | null,"metadata_suggestions"?: NonNullable<Json>,"pack_stale"?: boolean,"preached_on"?: string | null,"search_tsv"?: never,"series"?: string | null,"short_summary"?: string | null,"speaker"?: string | null,"status"?: Database["public"]['Enums']["sermon_status"],"title"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sermons_current_pack_fk"
      columns: ["current_pack_id"]
isOneToOne: false
      referencedRelation: "ai_artifacts"
      referencedColumns: ["id"]
    }
                  ]
                },"source_chunks": {
                  Row: {
                    "chunk_index": number,"content_hash": string,"created_at": string,"embedding": string | null,"embedding_model": string | null,"id": string,"note_block_ids": (string)[],"page": number | null,"section_title": string | null,"sermon_id": string,"source_id": string,"source_type": Database["public"]['Enums']["source_type"],"text": string,"timestamp_end": number | null,"timestamp_start": number | null,"tsv": unknown,"user_id": string
                  }
                  Insert: {
                    "chunk_index": number,"content_hash": string,"created_at"?: string,"embedding"?: string | null,"embedding_model"?: string | null,"id"?: string,"note_block_ids"?: (string)[],"page"?: number | null,"section_title"?: string | null,"sermon_id": string,"source_id": string,"source_type": Database["public"]['Enums']["source_type"],"text": string,"timestamp_end"?: number | null,"timestamp_start"?: number | null,"tsv"?: never,"user_id": string
                  }
                  Update: {
                    "chunk_index"?: number,"content_hash"?: string,"created_at"?: string,"embedding"?: string | null,"embedding_model"?: string | null,"id"?: string,"note_block_ids"?: (string)[],"page"?: number | null,"section_title"?: string | null,"sermon_id"?: string,"source_id"?: string,"source_type"?: Database["public"]['Enums']["source_type"],"text"?: string,"timestamp_end"?: number | null,"timestamp_start"?: number | null,"tsv"?: never,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "source_chunks_sermon_id_fkey"
      columns: ["sermon_id"]
isOneToOne: false
      referencedRelation: "sermons"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "source_chunks_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "sermon_sources"
      referencedColumns: ["id"]
    }
                  ]
                },"source_citations": {
                  Row: {
                    "confidence": Database["public"]['Enums']["confidence_level"] | null,"created_at": string,"excerpt": string | null,"id": string,"note_block_id": string | null,"page": number | null,"position": number,"sermon_id": string,"source_id": string,"source_key": string | null,"subject_id": string,"subject_part": string | null,"subject_type": string,"timestamp_end": number | null,"timestamp_start": number | null,"user_id": string
                  }
                  Insert: {
                    "confidence"?: Database["public"]['Enums']["confidence_level"] | null,"created_at"?: string,"excerpt"?: string | null,"id"?: string,"note_block_id"?: string | null,"page"?: number | null,"position"?: number,"sermon_id": string,"source_id": string,"source_key"?: string | null,"subject_id": string,"subject_part"?: string | null,"subject_type": string,"timestamp_end"?: number | null,"timestamp_start"?: number | null,"user_id": string
                  }
                  Update: {
                    "confidence"?: Database["public"]['Enums']["confidence_level"] | null,"created_at"?: string,"excerpt"?: string | null,"id"?: string,"note_block_id"?: string | null,"page"?: number | null,"position"?: number,"sermon_id"?: string,"source_id"?: string,"source_key"?: string | null,"subject_id"?: string,"subject_part"?: string | null,"subject_type"?: string,"timestamp_end"?: number | null,"timestamp_start"?: number | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "source_citations_sermon_id_fkey"
      columns: ["sermon_id"]
isOneToOne: false
      referencedRelation: "sermons"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "source_citations_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "sermon_sources"
      referencedColumns: ["id"]
    }
                  ]
                },"study_guides": {
                  Row: {
                    "artifact_id": string | null,"content": Json | null,"created_at": string,"error_message": string | null,"format": string,"id": string,"sermon_id": string,"status": string,"title": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "artifact_id"?: string | null,"content"?: Json | null,"created_at"?: string,"error_message"?: string | null,"format": string,"id"?: string,"sermon_id": string,"status"?: string,"title"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "artifact_id"?: string | null,"content"?: Json | null,"created_at"?: string,"error_message"?: string | null,"format"?: string,"id"?: string,"sermon_id"?: string,"status"?: string,"title"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "study_guides_artifact_id_fkey"
      columns: ["artifact_id"]
isOneToOne: false
      referencedRelation: "ai_artifacts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "study_guides_sermon_id_fkey"
      columns: ["sermon_id"]
isOneToOne: false
      referencedRelation: "sermons"
      referencedColumns: ["id"]
    }
                  ]
                },"terms": {
                  Row: {
                    "context": string,"created_at": string,"definition": string,"hidden": boolean,"id": string,"origin": Database["public"]['Enums']["item_origin"],"pack_artifact_id": string | null,"position": number,"sermon_id": string,"term": string,"updated_at": string,"user_edited": boolean,"user_id": string
                  }
                  Insert: {
                    "context"?: string,"created_at"?: string,"definition"?: string,"hidden"?: boolean,"id"?: string,"origin"?: Database["public"]['Enums']["item_origin"],"pack_artifact_id"?: string | null,"position"?: number,"sermon_id": string,"term": string,"updated_at"?: string,"user_edited"?: boolean,"user_id": string
                  }
                  Update: {
                    "context"?: string,"created_at"?: string,"definition"?: string,"hidden"?: boolean,"id"?: string,"origin"?: Database["public"]['Enums']["item_origin"],"pack_artifact_id"?: string | null,"position"?: number,"sermon_id"?: string,"term"?: string,"updated_at"?: string,"user_edited"?: boolean,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "terms_pack_artifact_id_fkey"
      columns: ["pack_artifact_id"]
isOneToOne: false
      referencedRelation: "ai_artifacts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "terms_sermon_id_fkey"
      columns: ["sermon_id"]
isOneToOne: false
      referencedRelation: "sermons"
      referencedColumns: ["id"]
    }
                  ]
                },"user_settings": {
                  Row: {
                    "ai_processing_acknowledged_at": string | null,"bible_translation": string | null,"created_at": string,"text_size": string,"theme": string,"updated_at": string,"user_id": string,"weekly_review_enabled": boolean
                  }
                  Insert: {
                    "ai_processing_acknowledged_at"?: string | null,"bible_translation"?: string | null,"created_at"?: string,"text_size"?: string,"theme"?: string,"updated_at"?: string,"user_id": string,"weekly_review_enabled"?: boolean
                  }
                  Update: {
                    "ai_processing_acknowledged_at"?: string | null,"bible_translation"?: string | null,"created_at"?: string,"text_size"?: string,"theme"?: string,"updated_at"?: string,"user_id"?: string,"weekly_review_enabled"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"video_sources": {
                  Row: {
                    "age_restricted": boolean | null,"channel_title": string | null,"duration_seconds": number | null,"embeddable": boolean | null,"live_status": string,"media_file_id": string | null,"metadata_fetched_at": string | null,"metadata_provider": string | null,"origin": string,"original_url": string | null,"privacy_status": string,"published_at": string | null,"sermon_id": string,"source_id": string,"thumbnail_url": string | null,"title": string | null,"user_id": string,"youtube_video_id": string | null
                  }
                  Insert: {
                    "age_restricted"?: boolean | null,"channel_title"?: string | null,"duration_seconds"?: number | null,"embeddable"?: boolean | null,"live_status"?: string,"media_file_id"?: string | null,"metadata_fetched_at"?: string | null,"metadata_provider"?: string | null,"origin": string,"original_url"?: string | null,"privacy_status"?: string,"published_at"?: string | null,"sermon_id": string,"source_id": string,"thumbnail_url"?: string | null,"title"?: string | null,"user_id": string,"youtube_video_id"?: string | null
                  }
                  Update: {
                    "age_restricted"?: boolean | null,"channel_title"?: string | null,"duration_seconds"?: number | null,"embeddable"?: boolean | null,"live_status"?: string,"media_file_id"?: string | null,"metadata_fetched_at"?: string | null,"metadata_provider"?: string | null,"origin"?: string,"original_url"?: string | null,"privacy_status"?: string,"published_at"?: string | null,"sermon_id"?: string,"source_id"?: string,"thumbnail_url"?: string | null,"title"?: string | null,"user_id"?: string,"youtube_video_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "video_sources_media_file_id_fkey"
      columns: ["media_file_id"]
isOneToOne: false
      referencedRelation: "media_files"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "video_sources_sermon_id_fkey"
      columns: ["sermon_id"]
isOneToOne: false
      referencedRelation: "sermons"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "video_sources_source_id_fkey"
      columns: ["source_id"]
isOneToOne: true
      referencedRelation: "sermon_sources"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "consume_rate_limit":
{ Args: { "p_bucket": string,"p_limit": number,"p_window_seconds": number }; Returns: boolean
                           },
"create_note":
{ Args: { "p_sermon_id": string,"p_title"?: string }; Returns: {
              "client_updated_at": string | null,
"content": NonNullable<Json>,
"content_hash": string | null,
"created_at": string,
"id": string,
"plain_text": string,
"search_tsv": unknown,
"sermon_id": string,
"source_id": string,
"title": string,
"updated_at": string,
"user_id": string,
"version": number
            }
                          SetofOptions: {
        from: "*"
        to: "notes"
        isOneToOne: true
        isSetofReturn: false
      } },
"match_source_chunks":
{ Args: { "p_match_count"?: number,"p_query_embedding"?: string,"p_query_text": string,"p_sermon_id": string }; Returns: {
              "id": string,"note_block_ids": (string)[],"page": number,"score": number,"section_title": string,"source_id": string,"source_type": Database["public"]['Enums']["source_type"],"text": string,"timestamp_end": number,"timestamp_start": number
            }[]
                           },
"owns_sermon":
{ Args: { "p_sermon_id": string }; Returns: boolean
                           },
"save_note":
{ Args: { "p_base_version": number,"p_blocks": Json,"p_client_updated_at": string,"p_content": Json,"p_content_hash": string,"p_note_id": string,"p_plain_text": string,"p_title": string }; Returns: {
              "status": string,"version": number
            }[]
                           },
"search_library":
{ Args: { "p_book"?: string,"p_chapter"?: number,"p_church"?: string,"p_from"?: string,"p_limit"?: number,"p_query"?: string,"p_series"?: string,"p_speaker"?: string,"p_to"?: string }; Returns: {
              "matched_in": (string)[],"rank": number,"sermon_id": string,"snippet": string
            }[]
                           }
          }
          Enums: {
            "application_status": "open"|"completed"|"archived","artifact_status": "building"|"ready"|"failed"|"superseded","artifact_type": "VIDEO_ANALYSIS"|"AUDIO_ANALYSIS"|"PHOTO_ANALYSIS"|"DOCUMENT_ANALYSIS"|"SERMON_PACK"|"BIBLE_STUDY"|"ANSWER"|"SUMMARY"|"OUTLINE"|"QUIZ"|"FLASHCARDS"|"REVIEW"|"AUDIO_SCRIPT"|"VIDEO_SCRIPT","confidence_level": "high"|"medium"|"low","item_origin": "ai"|"user","job_status": "queued"|"running"|"succeeded"|"failed"|"cancelled","job_type": "INGEST_SERMON"|"ANALYZE_VIDEO"|"ANALYZE_AUDIO"|"PROCESS_PHOTO"|"PROCESS_DOCUMENT"|"EXTRACT_SCRIPTURE"|"BUILD_SERMON_PACK"|"CREATE_EMBEDDINGS"|"GENERATE_STUDY"|"GENERATE_FLASHCARDS"|"GENERATE_QUIZ"|"GENERATE_AUDIO_RECAP"|"GENERATE_VIDEO_RECAP","media_kind": "photo"|"audio"|"video"|"document"|"photo_preview","media_status": "pending"|"uploaded"|"verified"|"rejected","moment_category": "INTRODUCTION"|"CONTEXT"|"MAIN_POINT"|"SCRIPTURE"|"ILLUSTRATION"|"QUOTE"|"QUESTION"|"APPLICATION"|"PRAYER"|"CONCLUSION"|"BOOKMARK"|"IMPORTANT","question_status": "open"|"answered","quote_type": "VERBATIM_QUOTE"|"PARAPHRASE","review_kind": "remember"|"scripture"|"question"|"key_idea"|"application"|"confusing","review_status": "new"|"reviewed"|"saved"|"review_again"|"hidden","scripture_kind": "explicit"|"spoken"|"inferred"|"allusion","sermon_status": "draft"|"finished","source_status": "pending_upload"|"ready"|"processing"|"processed"|"failed"|"unavailable","source_type": "SERMON_VIDEO"|"UPLOADED_VIDEO"|"UPLOADED_AUDIO"|"USER_NOTE"|"PHOTO"|"OCR_EXTRACTION"|"DOCUMENT"|"BIBLE_SOURCE"|"AI_GENERATED"|"EXTERNAL_REFERENCE","timestamp_source": "ai"|"user_capture"|"user_correction","verification_status": "unverified"|"user_verified"|"user_corrected"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "application_status": ["open", "completed", "archived"],"artifact_status": ["building", "ready", "failed", "superseded"],"artifact_type": ["VIDEO_ANALYSIS", "AUDIO_ANALYSIS", "PHOTO_ANALYSIS", "DOCUMENT_ANALYSIS", "SERMON_PACK", "BIBLE_STUDY", "ANSWER", "SUMMARY", "OUTLINE", "QUIZ", "FLASHCARDS", "REVIEW", "AUDIO_SCRIPT", "VIDEO_SCRIPT"],"confidence_level": ["high", "medium", "low"],"item_origin": ["ai", "user"],"job_status": ["queued", "running", "succeeded", "failed", "cancelled"],"job_type": ["INGEST_SERMON", "ANALYZE_VIDEO", "ANALYZE_AUDIO", "PROCESS_PHOTO", "PROCESS_DOCUMENT", "EXTRACT_SCRIPTURE", "BUILD_SERMON_PACK", "CREATE_EMBEDDINGS", "GENERATE_STUDY", "GENERATE_FLASHCARDS", "GENERATE_QUIZ", "GENERATE_AUDIO_RECAP", "GENERATE_VIDEO_RECAP"],"media_kind": ["photo", "audio", "video", "document", "photo_preview"],"media_status": ["pending", "uploaded", "verified", "rejected"],"moment_category": ["INTRODUCTION", "CONTEXT", "MAIN_POINT", "SCRIPTURE", "ILLUSTRATION", "QUOTE", "QUESTION", "APPLICATION", "PRAYER", "CONCLUSION", "BOOKMARK", "IMPORTANT"],"question_status": ["open", "answered"],"quote_type": ["VERBATIM_QUOTE", "PARAPHRASE"],"review_kind": ["remember", "scripture", "question", "key_idea", "application", "confusing"],"review_status": ["new", "reviewed", "saved", "review_again", "hidden"],"scripture_kind": ["explicit", "spoken", "inferred", "allusion"],"sermon_status": ["draft", "finished"],"source_status": ["pending_upload", "ready", "processing", "processed", "failed", "unavailable"],"source_type": ["SERMON_VIDEO", "UPLOADED_VIDEO", "UPLOADED_AUDIO", "USER_NOTE", "PHOTO", "OCR_EXTRACTION", "DOCUMENT", "BIBLE_SOURCE", "AI_GENERATED", "EXTERNAL_REFERENCE"],"timestamp_source": ["ai", "user_capture", "user_correction"],"verification_status": ["unverified", "user_verified", "user_corrected"]
          }
        }
} as const

