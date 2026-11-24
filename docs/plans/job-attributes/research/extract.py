import re
WORDS={"one":1,"two":2,"three":3,"four":4,"five":5,"six":6,"seven":7,"eight":8,"nine":9,"ten":10,"twelve":12,"fifteen":15}
NUM=r"(\d{1,2}|"+"|".join(WORDS)+r")"
YR=re.compile(NUM+r"\s*\+?\s*(?:or more\s+)?(?:(?:-|–|—|to)\s*"+NUM+r"\s*\+?\s*)?(?:\(\d+\)\s*)?(?:\+\s*)?(?:or more\s+)?(?:years?|yrs?)\b(?:\s+of)?", re.I)
def n(x): return int(x) if x.isdigit() else WORDS[x.lower()]
def years(text):
    hits=[]
    for m in YR.finditer(text):
        ls=text.rfind("\n",0,m.start())+1; le=text.find("\n",m.end()); le=len(text) if le<0 else le
        line=text[ls:le]; pre=text[ls:m.start()].lower()
        bullet=bool(re.match(r"\s*[-•·*]",line))
        if "experience" not in line.lower() and "industry" not in line.lower() and not bullet: continue
        if re.search(r"(founded|history|for over|we have|in a row|has provided)",pre): continue
        a=n(m.group(1)); b=n(m.group(2)) if m.group(2) else None
        if a>25: continue
        hits.append((a,b))
    if not hits: return None
    a,b=hits[0]  # take minimum (most permissive / usually required)
    return {"min":a,"max":b}
LEVELS=[("TS/SCI",r"\bTS\s*/\s*SCI\b|top\s+secret\s*/\s*(?:sensitive|sci)|\bTS-SCI\b"),
        ("TOP_SECRET",r"\btop[\s-]+secret\b|\bTS\b(?=\s*(?:clearance|/))"),
        ("SECRET",r"(?<!trade )(?<!top )\bsecret\b(?=[^.\n]{0,40}clearance)|\bsecret\s+(?:level\s+)?(?:security\s+)?clearance|clearance[^.\n]{0,30}\bsecret\b"),
        ("PUBLIC_TRUST",r"public\s+trust")]
def clearance(text):
    t=text
    if re.search(r"(no|not)\s+(?:security\s+)?clearance\s+(?:is\s+)?required|does not require (?:a )?(?:security )?clearance",t,re.I):
        return {"level":"NONE","status":None,"poly":False}
    found=None
    cands=[]
    for lvl,pat in LEVELS:
        m=re.search(pat,t,re.I)
        if m: cands.append((m.start(),lvl,m))
    if cands:
        _,lvl,m=min(cands,key=lambda c:c[0])
        if lvl=="TOP_SECRET" and re.search(r"top secret[^.\n]{0,40}\bSCI\b",t[m.start():m.start()+80],re.I): lvl="TS/SCI"
        found=(lvl,m)
    if not found:
        if re.search(r"security clearance",t,re.I):
            m=re.search(r"security clearance",t,re.I); found=("UNSPECIFIED",m)
        else: return None
    lvl,m=found
    win=t[max(0,m.start()-200):m.end()+200].lower()
    near=t[max(0,m.start()-120):m.end()+60].lower()
    if re.search(r"eligib|ability to obtain|able to obtain|obtain and maintain|willing(ness)? to obtain|must be able to",near): status="ELIGIBLE"
    elif re.search(r"active|current(ly)? (hold|possess)|must (hold|possess|have)",near): status="ACTIVE"
    else: status="UNKNOWN"
    poly=bool(re.search(r"(?:CI|counterintelligence|full[\s-]scope|lifestyle)\s*(?:poly|polygraph)|(?:with|and)\s+(?:a\s+)?poly(?:graph)?\b",t,re.I))
    return {"level":lvl,"status":status,"poly":poly}
