import { z } from "zod";
const expectedRevision=z.number().int().positive();
export const stateCommandSchema=z.discriminatedUnion("action",[
 z.object({action:z.enum(["finalize","reopen","archive","unarchive","trash","restore"]),expectedRevision}).strict(),
 z.object({action:z.literal("favorite"),favorite:z.boolean(),expectedRevision}).strict(),
 z.object({action:z.literal("rename"),title:z.string().trim().min(1).max(240),expectedRevision}).strict(),
]);
export type DocumentState="draft"|"finalized"|"archived"|"trash";
export type StateCommand=z.infer<typeof stateCommandSchema>;
export type StateMetadata={preArchiveStatus?:"draft"|"finalized";preTrashStatus?:"draft"|"finalized"|"archived"};
export type StatePlan={status:DocumentState;newRevision:boolean;preArchiveStatus?:"draft"|"finalized";preTrashStatus?:"draft"|"finalized"|"archived"};
export function planDocumentState(current:DocumentState,command:StateCommand,metadata:StateMetadata={}):StatePlan {
 const invalid=()=>{throw new Error("INVALID_STATE");};
 if(command.action==="finalize")return current==="draft"?{status:"finalized",newRevision:false}:invalid();
 if(command.action==="reopen")return current==="finalized"?{status:"draft",newRevision:true}:invalid();
 if(command.action==="rename")return current==="draft"?{status:current,newRevision:true}:invalid();
 if(command.action==="archive")return current==="draft"||current==="finalized"?{status:"archived",newRevision:false,preArchiveStatus:current}:invalid();
 if(command.action==="unarchive")return current==="archived"?{status:metadata.preArchiveStatus??"draft",newRevision:false}:invalid();
 if(command.action==="trash")return current!=="trash"?{status:"trash",newRevision:false,preTrashStatus:current}:invalid();
 if(command.action==="restore")return current==="trash"?{status:metadata.preTrashStatus??"draft",newRevision:false}:invalid();
 return current!=="trash"?{status:current,newRevision:false}:invalid();
}
