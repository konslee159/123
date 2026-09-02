/**
 * 아주 단순한 Dynamic Time Warping(DTW) 구현.
 * 두 관절 좌표 시퀀스(가변 길이) 사이의 거리를 계산해, 손동작 템플릿과
 * 실시간 캡처된 시퀀스가 얼마나 비슷한지 비교하는 데 사용한다.
 *
 * 프레임 하나 = 21개(한 손) 또는 42개(양손) 랜드마크의 [x, y] 나열을 1차원으로
 * 펼친 벡터. 프레임 간 거리는 유클리드 거리를 사용한다.
 */

function euclidean(a, b) {
  let sum = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/**
 * @param {number[][]} seqA 프레임 배열 (템플릿)
 * @param {number[][]} seqB 프레임 배열 (실시간 캡처)
 * @returns {number} DTW 누적 거리 (작을수록 유사)
 */
export function dtwDistance(seqA, seqB) {
  const n = seqA.length;
  const m = seqB.length;
  if (n === 0 || m === 0) return Infinity;

  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(Infinity));
  dp[0][0] = 0;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = euclidean(seqA[i - 1], seqB[j - 1]);
      dp[i][j] = cost + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  // 시퀀스 길이로 정규화해 길이가 다른 시퀀스끼리도 공정하게 비교
  return dp[n][m] / (n + m);
}
