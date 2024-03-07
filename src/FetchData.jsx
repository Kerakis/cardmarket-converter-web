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
  const [fileContent, setFileContent] = useState('');
  const [fileChanged, setFileChanged] = useState(false);

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    setFile(file);
    setFileChanged(true);

    const reader = new FileReader();
    reader.onload = function (e) {
      setFileContent(e.target.result);
    };
    reader.onerror = function () {
      setError(reader.error.message);
    };
    reader.readAsText(file);
  };

  const handleLoadFile = () => {
    if (!file) {
      setError('No file selected.');
      setMissingIds([]);
      setData([]);
      setFileChanged(false);
      return;
    }

    const allData = [];
    const allMissingIds = [];

    setLoading(true);
    setError(null);
    setMissingIds([]);
    setData([]);

    // Parse the CSV file
    Papa.parse(fileContent, {
      header: true,
      complete: (results) => {
        if (!results.meta.fields.includes('idProduct')) {
          setError('Invalid CSV File. `idProduct` column required.');
          setLoading(false);
          setFileChanged(false);
          setMissingIds([]);
          setData([]);
          return;
        }

        // Fetch data for each Cardmarket ID
        results.data.forEach((row, index) => {
          setTimeout(() => {
            axios
              .get(`https://api.scryfall.com/cards/cardmarket/${row.idProduct}`)
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
                  setFileChanged(false);
                  setMissingIds([]);
                  setData([]);
                }
              })
              .finally(() => {
                if (index === results.data.length - 1) {
                  setData(allData);
                  setMissingIds(allMissingIds);
                  setLoading(false);
                  setFileChanged(false);
                }
              });
          }, index * 100); // delay for 100 milliseconds
        });
      },
      error: (err) => {
        setError(err.message);
        setLoading(false);
        setMissingIds([]);
        setData([]);
      },
    });
  };

  const disableLoadButton = loading || !fileChanged;

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
    <div className='flex flex-col items-center justify-center min-h-screen bg-gray-900'>
      <h1 className='text-5xl mb-24 mt-5'>
        CardMarket to Moxfield CSV Converter
      </h1>
      <input
        type='file'
        accept='.csv'
        onChange={handleFileUpload}
        className='my-4 p-2 border border-gray-300 rounded-md'
      />
      <button
        onClick={handleLoadFile}
        className='my-4 p-2 bg-blue-500 text-white rounded-md'
        disabled={disableLoadButton}>
        Load CSV File
      </button>

      <div className='flex flex-row space-x-4 my-4'>
        <textarea
          value={fileContent}
          defaultValue={`Load CSV File`}
          readOnly
          className={`flex-1 p-2 border border-gray-300 rounded-md ${
            data.length > 0 ? 'min-w-[600px]' : 'min-w-[1200px]'
          } min-h-[500px]`}
        />
        {data.length > 0 && (
          <textarea
            value={Papa.unparse(data)}
            readOnly
            className='flex-1 p-2 border border-gray-300 rounded-md min-w-[600px] min-h-[500px]'
          />
        )}
      </div>

      {loading ? (
        <div>
          <p className='my-4 text-lg text-blue-500'>Loading...</p>
          <p className='my-4 text-lg text-blue-500'>
            This may take a while depending on the size of your CSV file.
          </p>
        </div>
      ) : (
        <>
          {data.length > 0 && (
            <div>
              <button
                onClick={downloadData}
                className='my-4 p-2 bg-green-500 text-white rounded-md'>
                Download Moxfield CSV
              </button>
            </div>
          )}

          {/* Display the missing IDs */}
          {missingIds.length > 0 && (
            <div className='my-4 p-4 max-w-xl min-w-80 bg-red-100 rounded-md shadow-md'>
              <h2 className='text-lg font-bold text-red-600'>Missing IDs</h2>
              {missingIds.map((id, index) => (
                <p key={index} className='text-red-600'>
                  {id}
                </p>
              ))}
            </div>
          )}
        </>
      )}

      {/* Display the error message */}
      {error && (
        <div className='my-4 p-4 bg-yellow-100 rounded-md shadow-md'>
          <h2 className='text-lg font-bold text-yellow-600'>Error</h2>
          <p className='text-yellow-600'>{error}</p>
        </div>
      )}
    </div>
  );
}

export default FetchData;
