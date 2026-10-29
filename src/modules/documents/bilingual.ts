import {documentContentSchema,type DocumentContent} from "./schema";
import type {FormSchema} from "./form-schema";
export type PinnedTranslation={locale:"fr"|"ar";title:string;body:string};
/** Uses only translations attached to the SAME immutable catalogue version. Never translates or supplies a missing language. */
export function createPinnedDocumentContent(locale:"fr"|"ar",translations:ReadonlyArray<PinnedTranslation>,bilingual:boolean,schema:FormSchema|null):DocumentContent{
 const primary=translations.find(translation=>translation.locale===locale);if(!primary)throw new Error("LOCALE_UNAVAILABLE");
 const otherLocale=locale==="fr"?"ar":"fr";
 const secondary=bilingual?translations.find(translation=>translation.locale===otherLocale):undefined;
 if(bilingual&&!secondary)throw new Error("LOCALE_UNAVAILABLE");
 if(bilingual){
  const keys=new Set(schema?.fields.map(field=>field.key)??[]);
  for(const section of [primary,secondary!])for(const match of section.body.matchAll(/\{\{\s*([a-z][a-z0-9_]{0,59})\s*\}\}/g))if(!keys.has(match[1]))throw new Error("TEMPLATE_SCHEMA_INVALID");
 }
 return documentContentSchema.parse({title:primary.title,locale:primary.locale,body:primary.body,answers:{},...(secondary?{secondary:{title:secondary.title,locale:secondary.locale,body:secondary.body}}:{})});
}
/** An update may edit existing editable sections; adding/dropping/swapping an approved translation requires a new draft. */
export function assertSecondarySnapshotChange(previous:DocumentContent,next:DocumentContent,editable:boolean){
 if(previous.locale!==next.locale||previous.secondary?.locale!==next.secondary?.locale)throw new Error("BILINGUAL_SNAPSHOT_CHANGED");
 if(!editable&&JSON.stringify(previous.secondary)!==JSON.stringify(next.secondary))throw new Error("READ_ONLY_CONTENT");
}
