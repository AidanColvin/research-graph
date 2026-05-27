export default function VerificationCenter() {
  return (
    <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200">
      <h2 className="text-2xl font-semibold mb-6">Verification Required</h2>
      <p className="text-gray-600 mb-8">Review the claims below flagged by the ARIA-PI engine.</p>
      <div className="space-y-4">
        {/* Verification Items go here */}
        <div className="p-4 border border-yellow-200 bg-yellow-50 rounded-lg">
            <p className="text-sm">Claim: "Company X has an active partnership with UNC."</p>
            <div className="mt-4 flex gap-4">
                <button className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm">Validate</button>
                <button className="text-gray-600 text-sm">Flag for Edit</button>
            </div>
        </div>
      </div>
    </div>
  );
}
