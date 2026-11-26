import json,sys
A='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
def s2i(s):
    n=0
    for ch in s: n=n*62+A.index(ch)
    return n
def s2num(s):
    neg=s.startswith('-'); s=s[1:] if neg else s
    if '.' in s:
        a,b=s.split('.'); v=float(f"{s2i(a)}.{s2i(b)}")
    else: v=s2i(s)
    return -v if neg else v
def dec(vals,key):
    if key in ('','_'): return None
    v=vals[s2i(key)]
    if v is None or isinstance(v,(int,float,bool)): return v
    p=v[:2]
    if p=='b|': return v[2]=='T'
    if p=='n|': return s2num(v[2:])
    if p=='a|': return [dec(vals,k) for k in v[2:].split('|')] if v!='a|' else []
    if p=='o|':
        if v=='o|': return {}
        parts=v[2:].split('|'); keys=dec(vals,parts[0])
        if isinstance(keys,str): keys=[keys]
        return {k:dec(vals,x) for k,x in zip(keys,parts[1:])}
    if p=='s|': return v[2:]
    return v
vals,root=json.load(open(sys.argv[1]))
out=dec(vals,root)
json.dump(out,open(sys.argv[2],'w'),indent=1,ensure_ascii=False)
