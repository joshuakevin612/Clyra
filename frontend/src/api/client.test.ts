import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {ApiError,errorMessage,request,requestPages,setSession} from './client';
describe('session and contract errors',()=>{
 beforeEach(()=>{vi.stubGlobal('window',{dispatchEvent:vi.fn()});setSession(null)});
 afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks()});
 it('keeps bearer token in memory and clears it at logout',async()=>{const fetcher=vi.fn().mockImplementation(()=>Promise.resolve(new Response('{}')));vi.stubGlobal('fetch',fetcher);setSession('secret',new Date(Date.now()+60000).toISOString());await request('/auth/me');expect(new Headers(fetcher.mock.calls[0][1].headers).get('Authorization')).toBe('Bearer secret');setSession(null);await request('/auth/me');expect(new Headers(fetcher.mock.calls[1][1].headers).has('Authorization')).toBe(false)});
 it('does not disclose record existence',()=>{expect(errorMessage(new ApiError('FORBIDDEN','private'))).toBe(errorMessage(new ApiError('NOT_FOUND','secret')))});
 it('uses the required conflict message',()=>{expect(errorMessage(new ApiError('VERSION_CONFLICT','changed'))).toBe('This record changed. Reload to see the latest,')});
 it('expires sessions before issuing another request',async()=>{const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);setSession('expired','2020-01-01T00:00:00Z');await expect(request('/auth/me')).rejects.toMatchObject({code:'UNAUTHENTICATED'});expect(fetcher).not.toHaveBeenCalled();expect(window.dispatchEvent).toHaveBeenCalled()});
 it('ends a session when the account is disabled',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({error:{code:'ACCOUNT_DISABLED',message:'Disabled',details:[]}}),{status:403})));await expect(request('/auth/me')).rejects.toMatchObject({code:'ACCOUNT_DISABLED'});expect(window.dispatchEvent).toHaveBeenCalled()});
 it('collects every medication page',async()=>{const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({items:[{id:'med_a'}],nextCursor:'next'}))).mockResolvedValueOnce(new Response(JSON.stringify({items:[{id:'med_b'}],nextCursor:null})));vi.stubGlobal('fetch',fetcher);const result=await requestPages<{items:{id:string}[];nextCursor:string|null}>('/patients/pat_001/medications');expect(result.items.map(x=>x.id)).toEqual(['med_a','med_b']);expect(fetcher.mock.calls[1][0]).toContain('cursor=next')});

});
