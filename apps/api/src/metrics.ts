/** Quadratically weighted Cohen's kappa for paired ordinal ratings on 0..max. */
export function weightedCohenKappa(left:number[],right:number[],max=4){
  const pairs=left.map((a,i)=>[a,right[i]] as const).filter(([a,b])=>Number.isInteger(a)&&Number.isInteger(b)&&a>=0&&a<=max&&b>=0&&b<=max);
  const n=pairs.length;if(n<2)return {value:null,n,reason:'At least two paired cases are needed.'};
  const weight=(a:number,b:number)=>1-((a-b)*(a-b))/(max*max);
  const observed=pairs.reduce((sum,[a,b])=>sum+weight(a,b),0)/n;
  const leftCounts=Array(max+1).fill(0),rightCounts=Array(max+1).fill(0);
  for(const [a,b] of pairs){leftCounts[a]++;rightCounts[b]++;}
  let expected=0;for(let a=0;a<=max;a++)for(let b=0;b<=max;b++)expected+=leftCounts[a]/n*rightCounts[b]/n*weight(a,b);
  if(Math.abs(1-expected)<1e-12)return {value:null,n,reason:'Agreement is undefined because expected disagreement is zero for these ratings.'};
  return {value:Number(((observed-expected)/(1-expected)).toFixed(4)),n,reason:null as string|null};
}
