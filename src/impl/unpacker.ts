//@ts-nocheck

// Minimal p.a.c.k.e.r unpacker that returns the unpacked JavaScript code

class Unbaser {
    private base: number;
    private dictionary: Record<string, number> | undefined;
    private unbase: (str: string) => number;
  
    private static readonly ALPHABET: Record<number, string> = {
      62: '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
      95: ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~'
    };
  
    constructor(base: number) {
      this.base = base;
  
      if (36 < base && base < 62) {
        if (!Unbaser.ALPHABET[base]) {
          Unbaser.ALPHABET[base] = Unbaser.ALPHABET[62].slice(0, base);
        }
      }
  
      if (2 <= base && base <= 36) {
        this.unbase = (str: string) => parseInt(str, base);
      } else {
        try {
          this.dictionary = {};
          const alphabet = Unbaser.ALPHABET[base];
          if (!alphabet) throw new Error('Unsupported base encoding.');
          
          for (let i = 0; i < alphabet.length; i++) {
            const key = alphabet[i] as string;
            this.dictionary![key] = i;
          }
          this.unbase = this._dictunbaser.bind(this);
        } catch {
          throw new Error('Unsupported base encoding.');
        }
      }
    }
  
    private _dictunbaser(str: string): number {
      if (!this.dictionary) throw new Error('Dictionary not initialized');
      
      let ret = 0;
      const reversed = str.split('').reverse();
      
      for (let i = 0; i < reversed.length; i++) {
        const cipher = reversed[i];
        const value = this.dictionary![cipher];
        if (value === undefined) throw new Error(`Invalid character: ${cipher}`);
        ret += Math.pow(this.base, i) * value;
      }
      
      return ret;
    }
  
    public decode(str: string): number {
      return this.unbase(str);
    }
  }
  
  function detect(source: string): { detected: boolean; beginStr: string; endStr: string } {
    let beginStr = '';
    let endStr = '';
    
    const mystr = source.replace(/ /g, '').indexOf('eval(function(p,a,c,k,e,');
    
    if (mystr > 0) {
      beginStr = source.slice(0, mystr);
    }
    
    if (mystr !== -1) {
      if (!source.includes("')))")) {
        try {
          endStr = (source.split("}))", 2)[1] || '');
        } catch {
          endStr = '';
        }
      } else {
        endStr = (source.split("')))", 2)[1] || '');
      }
    }
    
    return { detected: mystr !== -1, beginStr, endStr };
  }
  
  function filterargs(source: string): [string, string[], number, number] {
    console.log('FILTERARGS: Source preview:', source.substring(0, 200));
    
    const juicers = [
      /\}\(('.*?'), *(\d+|\[\]), *(\d+), *'(.*?)'\.split\('\|'\), *(\d+), *(.*?)\)\)/s,
      /\}\(('.*?'), *(\d+|\[\]), *(\d+), *'(.*?)'\.split\('\|'\)\)/s
    ];
  
    for (let i = 0; i < juicers.length; i++) {
      console.log('FILTERARGS: Trying juicer pattern', i);
      const args = source.match(juicers[i]);
      if (args) {
        console.log('FILTERARGS: Found match with juicer', i);
        console.log('FILTERARGS: Groups:', args.slice(1));
        const groups = args.slice(1);
        if (groups[1] === "[]") {
          groups[1] = "62";
        }
        try {
          const result = [
            groups[0]?.slice(1, -1) ?? '',
            (groups[3] ?? '').split('|'),
            parseInt(String(groups[1])),
            parseInt(String(groups[2]))
          ];
          console.log('FILTERARGS: Parsed - radix:', result[2], 'count:', result[3], 'symtab_len:', result[1].length, 'payload_len:', result[0].length);
          return result as [string, string[], number, number];
        } catch (e) {
          console.log('FILTERARGS: Error parsing groups:', e);
          throw new Error('Corrupted p.a.c.k.e.r. data.');
        }
      }
    }
  
    console.log('FILTERARGS: No juicer pattern matched');
    throw new Error('Could not make sense of p.a.c.k.e.r data (unexpected code structure)');
  }
  
  export function unpackEvaled(source: string): string {
    console.log('UNPACKER: Starting unpacking, source length:', source.length);
    const { detected, beginStr, endStr } = detect(source);
    console.log('UNPACKER: Detected:', detected, 'begin_str length:', beginStr.length, 'end_str length:', endStr.length);
    
    if (!detected) {
      throw new Error('Not a P.A.C.K.E.R. coded file.');
    }
  
    console.log('UNPACKER: Filtering args...');
    const [payload, symtab, radix, count] = filterargs(source);
    console.log('UNPACKER: Payload length:', payload.length, 'symtab length:', symtab.length, 'radix:', radix, 'count:', count);
  
    if (count !== symtab.length) {
      throw new Error('Malformed p.a.c.k.e.r. symtab.');
    }
  
    console.log('UNPACKER: Creating Unbaser with radix:', radix);
    const unbase = new Unbaser(radix);
  
    console.log('UNPACKER: Starting word replacement...');
    let result = payload.replace(/\b\w+\b/g, (match) => {
      try {
        const index = unbase.decode(match);
        return symtab[index] || match;
      } catch {
        return match;
      }
    });
  
    console.log('UNPACKER: Word replacement completed, final result length:', result.length);
    result = beginStr + result + endStr;
    return result;
  }
  
  //it can be improved, but it works for now