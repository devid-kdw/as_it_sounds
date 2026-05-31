const target = process.argv[2] ?? "library";

const labels = {
  library: "AIS local library",
  dropzone: "FL Studio dropzone",
  cache: "AIS local cache",
};

console.log(`${labels[target] ?? "AIS local path"} opener is a placeholder until local path commands are approved.`);
