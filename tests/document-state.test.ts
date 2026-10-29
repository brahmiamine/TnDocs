import test from 'node:test';import assert from 'node:assert/strict';
import { planDocumentState,stateCommandSchema } from '../src/modules/document-state/policy';
test('finalization freezes current revision and reopening creates a new immutable revision',()=>{
 assert.deepEqual(planDocumentState('draft',{action:'finalize',expectedRevision:3}),{status:'finalized',newRevision:false});
 assert.deepEqual(planDocumentState('finalized',{action:'reopen',expectedRevision:3}),{status:'draft',newRevision:true});
 assert.throws(()=>planDocumentState('finalized',{action:'rename',expectedRevision:3,title:'changed'}));
});
test('archive and trash preserve locked finalized status through restore',()=>{
 assert.deepEqual(planDocumentState('finalized',{action:'archive',expectedRevision:1}),{status:'archived',newRevision:false,preArchiveStatus:'finalized'});
 assert.deepEqual(planDocumentState('archived',{action:'trash',expectedRevision:1}),{status:'trash',newRevision:false,preTrashStatus:'archived'});
 assert.equal(planDocumentState('trash',{action:'restore',expectedRevision:1},{preArchiveStatus:'finalized',preTrashStatus:'archived'}).status,'archived');
 assert.equal(planDocumentState('archived',{action:'unarchive',expectedRevision:1},{preArchiveStatus:'finalized'}).status,'finalized');
 assert.throws(()=>planDocumentState('trash',{action:'finalize',expectedRevision:1}));
});
test('state commands require optimistic revision, bounded rename and explicit favorites',()=>{
 assert.equal(stateCommandSchema.safeParse({action:'finalize'}).success,false);
 assert.equal(stateCommandSchema.safeParse({action:'favorite',favorite:true,expectedRevision:2}).success,true);
 assert.equal(stateCommandSchema.safeParse({action:'favorite',favorite:'yes',expectedRevision:2}).success,false);
 assert.equal(stateCommandSchema.safeParse({action:'rename',title:'',expectedRevision:2}).success,false);
 assert.equal(stateCommandSchema.safeParse({action:'reopen',expectedRevision:2,overrideSignature:true}).success,false);
});
