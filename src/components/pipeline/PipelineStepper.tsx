export default function PipelineStepper({ currentStage }: { currentStage: string }) {
  const stages = ['Overview', 'Mapping', 'Selection', 'Profiling', 'Value', 'Talking Points', 'Assembly', 'Verification'];
  
  return (
    <nav className="flex justify-between w-full max-w-4xl mx-auto border-b pb-4">
      {stages.map((stage) => (
        <span key={stage} className={`text-xs font-bold uppercase tracking-widest ${stage.toUpperCase() === currentStage ? 'text-blue-600' : 'text-gray-400'}`}>
          {stage}
        </span>
      ))}
    </nav>
  );
}
