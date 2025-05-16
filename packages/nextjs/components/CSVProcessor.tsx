import React, { useRef, useState } from "react";
import Papa from "papaparse";

interface Transaction {
  "Date Time": string;
  "Txn Hash": string;
  Type: string;
  "From Wallet": string;
  "To Wallet": string;
  "Token Name": string;
  "Token Amount In": string;
  "Token Amount Out": string;
  "Fiat Value In": string;
  "Fiat Value Out": string;
  Account: string;
}

interface WalletGroup {
  wallets: string[];
  totalAmount: number;
  displayName: string;
}

// Function to calculate string similarity (Levenshtein distance)
function calculateSimilarity(str1: string, str2: string): number {
  const track = Array(str2.length + 1)
    .fill(null)
    .map(() => Array(str1.length + 1).fill(null));
  for (let i = 0; i <= str1.length; i += 1) {
    track[0][i] = i;
  }
  for (let j = 0; j <= str2.length; j += 1) {
    track[j][0] = j;
  }
  for (let j = 1; j <= str2.length; j += 1) {
    for (let i = 1; i <= str1.length; i += 1) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      track[j][i] = Math.min(track[j][i - 1] + 1, track[j - 1][i] + 1, track[j - 1][i - 1] + indicator);
    }
  }
  const maxLength = Math.max(str1.length, str2.length);
  return 1 - track[str2.length][str1.length] / maxLength;
}

// Function to extract wallet address from HYPERLINK formula
function extractWalletAddress(hyperlink: string): string {
  // Check if it's a HYPERLINK formula
  if (hyperlink.startsWith("=HYPERLINK(")) {
    // Extract the address from the URL
    const match = hyperlink.match(/address\/([^"]+)/);
    return match ? match[1] : hyperlink;
  }
  return hyperlink;
}

// Function to extract display name from HYPERLINK formula
function extractDisplayName(hyperlink: string): string {
  // Check if it's a HYPERLINK formula
  if (hyperlink.startsWith("=HYPERLINK(")) {
    // Extract the text between the last comma and the closing parenthesis
    const match = hyperlink.match(/=HYPERLINK\(".*?","(.*?)"\)/);
    return match ? match[1] : hyperlink;
  }
  return hyperlink;
}

export const CSVProcessor: React.FC = () => {
  const [data, setData] = useState<Transaction[]>([]);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [walletGroups, setWalletGroups] = useState<WalletGroup[]>([]);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [currentMatch, setCurrentMatch] = useState<{ wallet1: string; wallet2: string } | null>(null);
  const [pendingGroups, setPendingGroups] = useState<{ [key: string]: string[] }>({});
  const [fileError, setFileError] = useState<string>("");
  const [similarPairs, setSimilarPairs] = useState<{ wallet1: string; wallet2: string; similarity: number }[]>([]);
  const [currentPairIndex, setCurrentPairIndex] = useState<number>(0);

  // Add a ref to maintain the current groups
  const currentGroupsRef = useRef<{ [key: string]: string[] }>({});

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    console.log("File selected:", event.target.files);
    setFileError("");

    const file = event.target.files?.[0];
    if (!file) {
      setFileError("No file selected");
      return;
    }

    console.log("Processing file:", file.name);

    if (!file.name.endsWith(".csv")) {
      setFileError("Please upload a CSV file");
      return;
    }

    Papa.parse(file, {
      header: true,
      complete: results => {
        console.log("Parse complete:", results);
        if (results.errors && results.errors.length > 0) {
          console.error("Parse errors:", results.errors);
          setFileError("Error parsing CSV file");
          return;
        }
        if (!results.data || results.data.length === 0) {
          setFileError("No data found in CSV file");
          return;
        }
        // Filter for cohort transactions
        const cohortData = (results.data as Transaction[]).filter(row => row.Account?.toLowerCase().includes("cohort"));
        console.log("Cohort transactions:", cohortData.length);
        setData(cohortData);
        console.log("Data set:", cohortData.length, "rows");
      },
      error: error => {
        console.error("Parse error:", error);
        setFileError("Error reading CSV file");
      },
    });
  };

  const handleConfirmation = (isMatch: boolean) => {
    if (isMatch && currentMatch) {
      const { wallet1, wallet2 } = currentMatch;
      const addr1 = extractWalletAddress(wallet1);
      const addr2 = extractWalletAddress(wallet2);

      console.log("Confirming match between:", {
        wallet1: { address: addr1, display: extractDisplayName(wallet1) },
        wallet2: { address: addr2, display: extractDisplayName(wallet2) },
      });

      // Update the ref with the current groups
      const currentGroups = { ...currentGroupsRef.current };

      // Find existing group for either wallet
      const existingGroupKey = Object.keys(currentGroups).find(key =>
        currentGroups[key].some(w => extractWalletAddress(w) === addr1 || extractWalletAddress(w) === addr2),
      );

      if (existingGroupKey) {
        // Add to existing group
        const newGroup = [...currentGroups[existingGroupKey]];
        if (!newGroup.some(w => extractWalletAddress(w) === addr1)) {
          newGroup.push(wallet1);
        }
        if (!newGroup.some(w => extractWalletAddress(w) === addr2)) {
          newGroup.push(wallet2);
        }
        currentGroups[existingGroupKey] = newGroup;
      } else {
        // Create new group using the first wallet's address as the key
        const newKey = addr1;
        currentGroups[newKey] = [wallet1, wallet2];
      }

      // Update both the ref and the state
      currentGroupsRef.current = currentGroups;
      setPendingGroups(currentGroups);

      console.log("Updated groups:", currentGroups);
    }

    // Move to the next pair
    const nextIndex = currentPairIndex + 1;
    if (nextIndex < similarPairs.length) {
      setCurrentPairIndex(nextIndex);
      setCurrentMatch(similarPairs[nextIndex]);
    } else {
      // No more pairs to process
      setShowConfirmation(false);
      setCurrentMatch(null);
      console.log("Finished processing all similar wallet pairs");
      console.log("Final groups:", currentGroupsRef.current);

      // Process the data with the final groups
      processData();
    }
  };

  const processData = () => {
    console.log("Processing data...");
    console.log("Data length:", data.length);
    console.log("Start date:", startDate);
    console.log("End date:", endDate);
    console.log("Current groups:", currentGroupsRef.current);

    if (!data.length) {
      console.log("No data to process");
      return;
    }

    // Filter for cohort transactions
    const cohortData = data.filter(row => row.Account?.toLowerCase().includes("cohort"));

    const filteredData = cohortData.filter(row => {
      const rowDate = new Date(row["Date Time"]);
      const start = startDate ? new Date(startDate) : new Date(0);
      const end = endDate ? new Date(endDate) : new Date(8640000000000000);
      return rowDate >= start && rowDate <= end;
    });

    console.log("Filtered data length:", filteredData.length);

    // Create a map of wallet groups
    const walletMap = new Map<string, number>();
    const walletDisplayNames = new Map<string, string>();

    // First, create a map of all wallet addresses to their group keys
    const addressToGroupKey = new Map<string, string>();
    Object.entries(currentGroupsRef.current).forEach(([groupKey, wallets]) => {
      wallets.forEach(wallet => {
        const address = extractWalletAddress(wallet);
        addressToGroupKey.set(address, groupKey);
        console.log("Mapping address to group:", { address, groupKey });
      });
    });

    console.log("Address to group mapping:", Object.fromEntries(addressToGroupKey));

    filteredData.forEach(row => {
      const wallet = row["To Wallet"];
      const amount = parseFloat(row["Fiat Value Out"]) || 0;
      const address = extractWalletAddress(wallet);
      const displayName = extractDisplayName(wallet);

      // Store the display name for this address
      walletDisplayNames.set(address, displayName);

      // Check if this wallet belongs to any group
      const groupKey = addressToGroupKey.get(address);

      if (groupKey) {
        // Add to the group's total
        const currentTotal = walletMap.get(groupKey) || 0;
        walletMap.set(groupKey, currentTotal + amount);
        console.log("Added to group:", {
          address,
          groupKey,
          amount,
          newTotal: currentTotal + amount,
        });
      } else {
        // Add as individual wallet
        const currentTotal = walletMap.get(address) || 0;
        walletMap.set(address, currentTotal + amount);
        console.log("Added as individual:", {
          address,
          amount,
          newTotal: currentTotal + amount,
        });
      }
    });

    // Convert to array and sort by amount
    const groups: WalletGroup[] = Array.from(walletMap.entries()).map(([address, totalAmount]) => {
      // Get all wallets in this group
      const groupWallets = currentGroupsRef.current[address] || [address];
      // Get the display name from the first wallet in the group
      const displayName = walletDisplayNames.get(address) || address;

      console.log("Creating group:", {
        address,
        groupWallets,
        displayName,
        totalAmount,
      });

      return {
        wallets: groupWallets,
        totalAmount,
        displayName,
      };
    });

    console.log("Final groups:", groups);

    groups.sort((a, b) => b.totalAmount - a.totalAmount);
    setWalletGroups(groups);
  };

  return (
    <div className="container mx-auto p-4">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">BuidlGuidl Streams</h1>
        <p className="mt-2 text-gray-600">Process and analyze your stream data</p>
      </div>

      <div className="border-2 border-dashed p-8 text-center">
        <input
          type="file"
          accept=".csv"
          onChange={handleFileUpload}
          className="block w-full text-sm text-gray-500
            file:mr-4 file:py-2 file:px-4
            file:rounded-full file:border-0
            file:text-sm file:font-semibold
            file:bg-blue-50 file:text-blue-700
            hover:file:bg-blue-100"
        />
        {fileError && <p className="text-red-500 mt-2">{fileError}</p>}
        {data.length > 0 && <p className="text-green-500 mt-2">File loaded successfully: {data.length} rows</p>}
      </div>

      <div className="mt-4 space-y-4">
        <div className="flex gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex gap-4">
          <button
            onClick={() => {
              // First find similar wallets
              const cohortData = data.filter(row => row.Account?.toLowerCase().includes("cohort"));
              const wallets = Array.from(new Set(cohortData.map(row => row["To Wallet"])));
              console.log("Found", wallets.length, "unique destination wallets");

              // Get all wallets that are already in groups
              const processedWallets = new Set<string>();
              Object.values(pendingGroups).forEach(group => {
                group.forEach(wallet => processedWallets.add(wallet));
              });

              const pairs: { wallet1: string; wallet2: string; similarity: number }[] = [];

              for (let i = 0; i < wallets.length; i++) {
                // Skip if this wallet is already in a group
                if (processedWallets.has(wallets[i])) continue;

                for (let j = i + 1; j < wallets.length; j++) {
                  // Skip if this wallet is already in a group
                  if (processedWallets.has(wallets[j])) continue;

                  const wallet1 = wallets[i];
                  const wallet2 = wallets[j];

                  // Skip if they're exactly the same
                  if (wallet1 === wallet2) continue;

                  // Extract addresses and names
                  const addr1 = extractWalletAddress(wallet1);
                  const addr2 = extractWalletAddress(wallet2);
                  const name1 = extractDisplayName(wallet1);
                  const name2 = extractDisplayName(wallet2);

                  // Skip if they're the same address
                  if (addr1 === addr2) continue;

                  // Compare the display names for similarity
                  const similarity = calculateSimilarity(name1, name2);
                  console.log(`Comparing ${name1} with ${name2}, similarity: ${similarity}`);

                  if (similarity > 0.7) {
                    // Threshold for similarity
                    pairs.push({
                      wallet1,
                      wallet2,
                      similarity,
                    });
                  }
                }
              }

              // Sort by similarity score
              pairs.sort((a, b) => b.similarity - a.similarity);
              setSimilarPairs(pairs);
              setCurrentPairIndex(0);

              // Start the confirmation process if we have pairs
              if (pairs.length > 0) {
                setCurrentMatch(pairs[0]);
                setShowConfirmation(true);
              } else {
                // If no similar wallets found, process the data directly
                processData();
              }
            }}
            className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
          >
            Process Data
          </button>
        </div>

        {showConfirmation && currentMatch && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
            <div className="bg-white p-6 rounded-lg shadow-xl">
              <h3 className="text-lg font-medium mb-4">Are these the same wallet?</h3>
              <div className="space-y-2 mb-4">
                <div>
                  <p className="font-semibold">Wallet 1:</p>
                  <p className="text-sm text-gray-600">Address: {extractWalletAddress(currentMatch.wallet1)}</p>
                  <p className="text-sm text-gray-600">Name: {extractDisplayName(currentMatch.wallet1)}</p>
                </div>
                <div>
                  <p className="font-semibold">Wallet 2:</p>
                  <p className="text-sm text-gray-600">Address: {extractWalletAddress(currentMatch.wallet2)}</p>
                  <p className="text-sm text-gray-600">Name: {extractDisplayName(currentMatch.wallet2)}</p>
                </div>
              </div>
              <div className="flex justify-end gap-4">
                <button
                  onClick={() => {
                    handleConfirmation(false);
                    // If this was the last pair, process the data
                    if (currentPairIndex + 1 >= similarPairs.length) {
                      processData();
                    }
                  }}
                  className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
                >
                  No
                </button>
                <button
                  onClick={() => {
                    handleConfirmation(true);
                    // If this was the last pair, process the data
                    if (currentPairIndex + 1 >= similarPairs.length) {
                      processData();
                    }
                  }}
                  className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                >
                  Yes
                </button>
              </div>
            </div>
          </div>
        )}

        {walletGroups.length > 0 && (
          <div className="mt-8">
            <h2 className="text-xl font-bold mb-4">Results</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      To Wallet(s)
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total FIAT Amount Out
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {walletGroups.map((group, index) => (
                    <tr key={index}>
                      <td className="px-6 py-4 whitespace-pre-wrap">
                        {group.wallets.length > 1 ? (
                          // Display grouped wallets
                          group.wallets.map(wallet => {
                            const address = extractWalletAddress(wallet);
                            const displayName = extractDisplayName(wallet);
                            return (
                              <div key={address} className="mb-2">
                                <div className="font-semibold">{displayName}</div>
                                <div className="text-sm text-gray-600">{address}</div>
                              </div>
                            );
                          })
                        ) : (
                          // Display single wallet
                          <div className="mb-2">
                            <div className="font-semibold">{group.displayName}</div>
                            <div className="text-sm text-gray-600">{group.wallets[0]}</div>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {group.totalAmount.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
