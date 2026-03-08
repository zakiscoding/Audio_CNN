const Waveform = ({ data, title }: { data: number[]; title: string }) => {
  if (!data || data.length === 0) return null;

  const width = 600;
  const height = 300;
  const centerY = height / 2;

  const validData = data.filter((val) => !isNaN(val) && isFinite(val));
  if (validData.length === 0) return null;

  const min = Math.min(...validData);
  const max = Math.max(...validData);
  const range = max - min;
  const scaleY = height * 0.45;

  const pathData = validData
    .map((sample, i) => {
      const x = (i / (validData.length - 1)) * width;
      let y = centerY;

      if (range > 0) {
        const normalizedSample = (sample - min) / range; // 0 - 1, -0.5 - 0.5
        y = centerY - (normalizedSample - 0.5) * 2 * scaleY;
      }

      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex flex-1 items-center justify-center">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          className="block max-h-75 max-w-full rounded"
          style={{ border: "1px solid #1e2d3d", background: "#060911" }}
        >
          <path
            d={`M 0 ${centerY} H ${width}`}
            stroke="#1e2d3d"
            strokeWidth="1"
          />
          <path
            d={pathData}
            fill="none"
            stroke="#22d3ee"
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            style={{ filter: "drop-shadow(0 0 3px rgba(34,211,238,0.4))" }}
          />
        </svg>
      </div>
      <p className="mt-2 text-center text-xs text-slate-600">{title}</p>
    </div>
  );
};

export default Waveform;