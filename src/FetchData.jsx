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
  const [fileChanged, setFileChanged] = useState(true);
  const [copied, setCopied] = useState(null);

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
      setCopied(false);
      setFileChanged(false);
      return;
    }

    setLoading(true);
    setError(null);
    setMissingIds([]);
    setData([]);
    setCopied(false);

    // Parse the CSV file
    Papa.parse(fileContent, {
      header: true,
      complete: (results) => {
        const fields = results.meta.fields;
        if (!fields.includes('idProduct') && !fields.includes('Product ID')) {
          setError(
            'Invalid CSV File. `idProduct` or `Product ID` column required.'
          );
          setLoading(false);
          setFileChanged(false);
          setMissingIds([]);
          setData([]);
          setCopied(false);
          return;
        }

        // Fetch data for each Cardmarket ID
        results.data.forEach((row, index) => {
          setTimeout(() => {
            let isToken = '';
            let expansion = row.Expansion || '';
            let article = row.Article || '';

            if (fields.includes('Product ID')) {
              if (row.Category && row.Category !== 'Magic Single') {
                return;
              }
            }

            expansion = expansion.replace(': Extras', '');
            if (['Mystery Booster', 'The List'].includes(expansion)) {
              expansion = 'PLST';
            } else if (expansion === '30th Anniversary Celebration') {
              expansion = 'P30A';
            }
            if (expansion.includes('Commander:')) {
              expansion = expansion.replace('Commander: ', '');
            }
            expansion = expansion.replace(': Promos', ' Promos');
            article = article.replace(/\(.*\)/, '');
            if (article.includes('Token')) {
              article = article.replace(/Token.*$/, '');
              expansion += ' Tokens';
              isToken = '+t:token';
            }

            const idProduct = row['Product ID'] || row.idProduct;
            const count = row.groupCount || row.Amount;
            const purchasePrice = row.price || row['Article Value'];

            axios
              .get(`https://api.scryfall.com/cards/cardmarket/${idProduct}`)
              .then((response) => {
                if (response.status === 200) {
                  const card = response.data;
                  setData((prevData) => [
                    ...prevData,
                    {
                      Count: count,
                      Name: card.name,
                      Edition: card.set,
                      Language: getLanguageName(row.idLanguage) || '',
                      Foil: getFoil(row.isFoil, card.finishes),
                      CollectorNumber: card.collector_number,
                      Alter: row.isAltered === 'true' ? 'TRUE' : 'FALSE',
                      Condition: getConditionName(row.condition) || 'NM',
                      PurchasePrice: purchasePrice,
                    },
                  ]);
                }
              })
              .catch((err) => {
                if (
                  err.response &&
                  err.response.status === 404 &&
                  row.Article &&
                  row.Expansion
                ) {
                  axios
                    .get(
                      `https://api.scryfall.com/cards/search?q=e%3A%22${expansion}%22+${article}${isToken}`
                    )
                    .then((response) => {
                      if (response.status === 200) {
                        const card = response.data;
                        setData((prevData) => [
                          ...prevData,
                          {
                            Count: count,
                            Name: card.data[0].name,
                            Edition: card.data[0].set,
                            Language: getLanguageName(row.idLanguage) || '',
                            Foil: getFoil(row.isFoil, card.data[0].finishes),
                            CollectorNumber: card.data[0].collector_number,
                            Alter: row.isAltered === 'true' ? 'TRUE' : 'FALSE',
                            Condition: getConditionName(row.condition) || 'NM',
                            PurchasePrice: purchasePrice,
                          },
                        ]);
                        setMissingIds((prevMissingIds) => [
                          ...prevMissingIds,
                          {
                            id: idProduct,
                            name: card.data[0].name,
                            expansion: '',
                            uri: card.data[0].scryfall_uri,
                          },
                        ]);
                      }
                    })
                    .catch((err) => {
                      if (
                        err.response &&
                        err.response.status == 404 &&
                        row.Category == 'Magic Single'
                      ) {
                        setMissingIds((prevMissingIds) => [
                          ...prevMissingIds,
                          {
                            id: idProduct,
                            name: article,
                            expansion: expansion,
                            uri: '',
                          },
                        ]);
                      }
                    })
                    .finally(() => {
                      if (index === results.data.length - 1) {
                        setLoading(false);
                        setFileChanged(false);
                      }
                    });
                } else if (
                  err.response &&
                  err.response.status === 404 &&
                  !row.Category
                ) {
                  setMissingIds((prevMissingIds) => [
                    ...prevMissingIds,
                    {
                      id: idProduct,
                      name: 'Scryfall is missing this CardMarket ID.',
                      uri: '',
                    },
                  ]);
                } else {
                  if (err.response && err.response.status !== 404) {
                    setError(err.message);
                  }
                  setFileChanged(false);
                  setMissingIds([]);
                  setData([]);
                  setCopied(false);
                }
              })
              .finally(() => {
                if (index === results.data.length - 1) {
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
        setCopied(false);
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
      GD: 'MP',
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
          value={
            fileContent ||
            'Please load your CardMarket CSV file. The input data will show here once loaded.'
          }
          readOnly
          className={`flex-1 p-2 border border-gray-300 rounded-md resize-none ${
            data.length > 0 ? 'min-w-[600px]' : 'min-w-[1200px]'
          } min-h-[500px]`}
        />
        {data.length > 0 && (
          <textarea
            value={Papa.unparse(data)}
            readOnly
            className='flex-1 p-2 border border-gray-300 rounded-md resize-none min-w-[600px] min-h-[500px]'
          />
        )}
      </div>

      {loading ? (
        <div className='my-4 p-4 bg-blue-100 rounded-md shadow-md'>
          <p className='text-lg text-blue-600'>
            Loading...
            <br />
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
            <>
              <div
                className='my-4 p-4 max-w-xl min-w-[750px] bg-red-100 rounded-md shadow-md overflow-auto'
                style={{ maxHeight: '200px' }}>
                <h2 className='text-lg font-bold mb-2 text-red-600 text-center'>
                  Missing CardMarket IDs
                </h2>
                {missingIds.map((item, index) => (
                  <p key={index} className='text-red-600'>
                    {item.id} -{' '}
                    {item.uri ? (
                      <>
                        This is likely{' '}
                        <a
                          href={item.uri}
                          target='_blank'
                          rel='noopener noreferrer'>
                          <strong>{item.name}</strong>
                        </a>
                        . You should double-check the printing.
                      </>
                    ) : item.expansion ? (
                      <>
                        This may be <strong>{item.name}</strong> from{' '}
                        {item.expansion}, but I cannot be sure.
                      </>
                    ) : (
                      item.name
                    )}
                  </p>
                ))}
              </div>
              <button
                onClick={() => {
                  const missingIdsText = missingIds
                    .map((item) => item.id)
                    .join('\n');
                  navigator.clipboard.writeText(missingIdsText);
                  setCopied(true);
                }}
                className='my-4 p-2 bg-yellow-500 text-white rounded-md relative'>
                {copied ? 'Copied!' : 'Copy Missing IDs'}
              </button>
            </>
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
