import { useState } from 'react';
import axios from 'axios';
import Papa from 'papaparse';
import { saveAs } from 'file-saver';

function FetchData() {
  const [data, setData] = useState([]);
  const [missingIds, setMissingIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [file, setFile] = useState(null);

  const handleFileUpload = (event) => {
    setFile(event.target.files[0]);
  };

  const handleLoadFile = () => {
    if (!file) {
      setError('No file selected.');
      return;
    }

    const reader = new FileReader();
    const allData = [];
    const allMissingIds = [];

    setLoading(true);
    setError(null);

    reader.onload = function (e) {
      // Parse the CSV file
      Papa.parse(e.target.result, {
        header: true,
        complete: (results) => {
          if (!results.meta.fields.includes('idProduct')) {
            setError('Invalid CSV File. `idProduct` column required.');
            setLoading(false);
            return;
          }

          // Fetch data for each Cardmarket ID
          results.data.forEach((row, index) => {
            setTimeout(() => {
              axios
                .get(
                  `https://api.scryfall.com/cards/cardmarket/${row.idProduct}`
                )
                .then((response) => {
                  if (response.status === 200) {
                    const card = response.data;
                    allData.push({
                      Count: row.groupCount || '',
                      Name: card.name,
                      Edition: card.set,
                      Language: getLanguageName(row.idLanguage) || '',
                      Foil: getFoil(row.isFoil, card.finishes),
                      CollectorNumber: card.collector_number,
                      Alter: row.isAltered === 'true' ? 'TRUE' : 'FALSE',
                      Condition: getConditionName(row.condition) || 'NM',
                      PurchasePrice: row.price || '',
                    });
                  }
                })
                .catch((err) => {
                  if (err.response && err.response.status === 404) {
                    allMissingIds.push(row.idProduct);
                  } else {
                    setError(err.message);
                  }
                })
                .finally(() => {
                  if (index === results.data.length - 1) {
                    setData(allData);
                    setMissingIds(allMissingIds);
                    setLoading(false);
                  }
                });
            }, index * 100); // delay for 100 milliseconds
          });
        },
        error: (err) => {
          setError(err.message);
          setLoading(false);
        },
      });
    };

    reader.onerror = function () {
      setError(reader.error.message);
      setLoading(false);
    };

    reader.readAsText(file);
  };

  // Define a function to convert language code to language name
  function getLanguageName(code) {
    const languages = {
      1: 'English',
      2: 'French',
      3: 'German',
      4: 'Spanish',
      5: 'Italian',
      6: 'Simplified Chinese',
      7: 'Japanese',
      8: 'Portuguese',
      9: 'Russian',
      10: 'Korean',
      11: 'Traditional Chinese',
    };
    return languages[code] || '';
  }

  // Define a function to convert condition code to condition name
  function getConditionName(code) {
    const conditions = {
      MT: 'M',
      NM: 'NM',
      EX: 'LP',
      GD: 'LP',
      LP: 'MP',
      PL: 'HP',
      PO: 'D',
    };
    return conditions[code] || 'NM';
  }

  // Define a function to determine the foil status
  function getFoil(isFoil, finishes) {
    if (isFoil === '1') {
      if (finishes.includes('etched') && !finishes.includes('foil')) {
        return 'etched';
      } else {
        return 'foil';
      }
    } else {
      return '';
    }
  }

  // Define a function to download the data as a CSV file
  function downloadData() {
    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, 'output.csv');
  }

  return (
    <div>
      <input type='file' accept='.csv' onChange={handleFileUpload} />
      <button onClick={handleLoadFile}>Load CSV File</button>

      {loading ? (
        <div>
          <p>Loading...</p>
          <p>This may take a while depending on the size of your CSV file.</p>
        </div>
      ) : (
        <>
          {data.length > 0 && (
            <>
              <button onClick={downloadData}>Download CSV</button>
              <pre>{Papa.unparse(data)}</pre>
            </>
          )}

          {/* Display the missing IDs */}
          {missingIds.length > 0 && (
            <div>
              <h2>Missing IDs</h2>
              {missingIds.map((id, index) => (
                <p key={index}>{id}</p>
              ))}
            </div>
          )}
        </>
      )}

      {/* Display the error message */}
      {error && (
        <div>
          <h2>Error</h2>
          <p>{error}</p>
        </div>
      )}
    </div>
  );
}

export default FetchData;
