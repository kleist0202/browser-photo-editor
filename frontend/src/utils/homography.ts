export type Point = { x: number; y: number };

// Eliminacja Gaussa — rozwiązuje układ Ax = b
function gaussianElimination(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) maxRow = row;
    }
    [M[col], M[maxRow]] = [M[maxRow], M[col]];

    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[col][col]) < 1e-10) continue;
      const f = M[row][col] / M[col][col];
      for (let j = col; j <= n; j++) M[row][j] -= f * M[col][j];
    }
  }

  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = M[i][n] / M[i][i];
    for (let j = i - 1; j >= 0; j--) M[j][n] -= M[j][i] * x[i];
  }
  return x;
}

// Liczy macierz homografii 3×3 (9 wartości) dla 4 par punktów src→dst
export function computeHomography(src: Point[], dst: Point[]): number[] {
  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const { x: sx, y: sy } = src[i];
    const { x: dx, y: dy } = dst[i];
    A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy]);
    b.push(dx);
    A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy]);
    b.push(dy);
  }

  const h = gaussianElimination(A, b);
  return [...h, 1];
}

// Aplikuje macierz homografii na jeden punkt
export function applyH(H: number[], x: number, y: number): Point {
  const w = H[6] * x + H[7] * y + H[8];
  return { x: (H[0] * x + H[1] * y + H[2]) / w, y: (H[3] * x + H[4] * y + H[5]) / w };
}

function dist(a: Point, b: Point) {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

// Warps obraz na prostokąt — srcPoints to 4 rogi dokumentu w naturalnych pikselach
// Kolejność punktów: lewy-górny, prawy-górny, prawy-dolny, lewy-dolny
export function warpPerspective(img: HTMLImageElement, srcPoints: Point[]): string {
  // Rozmiar wyjścia = średnia długość przeciwległych krawędzi
  const outW = Math.round((dist(srcPoints[0], srcPoints[1]) + dist(srcPoints[3], srcPoints[2])) / 2);
  const outH = Math.round((dist(srcPoints[0], srcPoints[3]) + dist(srcPoints[1], srcPoints[2])) / 2);

  const dstPoints: Point[] = [
    { x: 0, y: 0 },
    { x: outW, y: 0 },
    { x: outW, y: outH },
    { x: 0, y: outH },
  ];

  // Odwrotna homografia: dla każdego piksela wyjścia → znajdź pixel źródłowy
  const H_inv = computeHomography(dstPoints, srcPoints);

  // Pobierz piksele źródłowe
  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = img.width;
  srcCanvas.height = img.height;
  const srcCtx = srcCanvas.getContext("2d")!;
  srcCtx.drawImage(img, 0, 0);
  const srcData = srcCtx.getImageData(0, 0, img.width, img.height).data;

  // Wypełnij piksele wyjściowe
  const dstCanvas = document.createElement("canvas");
  dstCanvas.width = outW;
  dstCanvas.height = outH;
  const dstCtx = dstCanvas.getContext("2d")!;
  const dstImg = dstCtx.createImageData(outW, outH);
  const dst = dstImg.data;
  const srcW = img.width;
  const srcH = img.height;

  for (let dy = 0; dy < outH; dy++) {
    for (let dx = 0; dx < outW; dx++) {
      const { x: sx, y: sy } = applyH(H_inv, dx, dy);
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      const x1 = x0 + 1,        y1 = y0 + 1;
      const fx = sx - x0,        fy = sy - y0;
      const i = (dy * outW + dx) * 4;

      if (x0 < 0 || y0 < 0 || x1 >= srcW || y1 >= srcH) {
        dst[i] = dst[i + 1] = dst[i + 2] = 255;
        dst[i + 3] = 255;
        continue;
      }

      // Interpolacja dwuliniowa
      for (let c = 0; c < 3; c++) {
        const g = (x: number, y: number) => srcData[(y * srcW + x) * 4 + c];
        dst[i + c] = Math.round(
          g(x0, y0) * (1 - fx) * (1 - fy) +
          g(x1, y0) * fx       * (1 - fy) +
          g(x0, y1) * (1 - fx) * fy +
          g(x1, y1) * fx       * fy,
        );
      }
      dst[i + 3] = 255;
    }
  }

  dstCtx.putImageData(dstImg, 0, 0);
  return dstCanvas.toDataURL("image/png");
}
