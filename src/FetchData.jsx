import { useState } from 'react';
import axios from 'axios';
import Papa from 'papaparse';
import { saveAs } from 'file-saver';

const year = new Date().getFullYear();

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
    setError(null);

    const reader = new FileReader();
    reader.onload = function (e) {
      setFileContent(e.target.result);
    };
    reader.onerror = function () {
      setError(reader.error.message);
    };
    reader.readAsText(file);
  };

  const handleLoadFile = async () => {
    // Create a queue to store the updates
    const updates = [];

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
      complete: async (results) => {
        const fields = results.meta.fields;
        if (
          !(
            fields.includes('idProduct') ||
            (fields.includes('Product ID') &&
              fields.includes('Article') &&
              fields.includes('Expansion'))
          )
        ) {
          setError([
            'Invalid file format.',
            'The file must include either an "idProduct" column header or all three of the following column headers: "Product ID", "Article", and "Expansion".',
            'Are you sure this is a CardMarket CSV file?',
          ]);
          setLoading(false);
          setFileChanged(false);
          setMissingIds([]);
          setData([]);
          setCopied(false);
          return;
        }

        // Fetch data for each Cardmarket ID
        const promises = results.data.map(async (row, index) => {
          await delay(index * 100);

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

          try {
            const response = await axios.get(
              `https://api.scryfall.com/cards/cardmarket/${idProduct}`
            );
            if (response.status === 200) {
              const card = response.data;

              // When you receive data, add the update to the queue
              updates[index] = (prevData) => [
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
              ];
            }
          } catch (err) {
            if (
              err.response &&
              err.response.status === 404 &&
              row.Article &&
              row.Expansion
            ) {
              try {
                const response = await axios.get(
                  `https://api.scryfall.com/cards/search?q=e%3A%22${expansion}%22+${article}${isToken}`
                );
                if (response.status === 200) {
                  const card = response.data;

                  // When you receive data, add the update to the queue
                  updates[index] = (prevData) => [
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
                  ];
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
              } catch (err) {
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
              }
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
              setData([]);
              setCopied(false);
            }
          } finally {
            if (index === results.data.length - 1) {
              // Convert the updates object back into an array in the correct order
              const orderedData = Object.keys(updates)
                .sort((a, b) => a - b)
                .map((key) => updates[key]);

              for (let update of orderedData) {
                setData(update);
              }
              setLoading(false);
              setFileChanged(false);
            }
          }
        });
        await Promise.all(promises);
      },
      error: async (err) => {
        setError(err.message);
        setLoading(false);
        setMissingIds([]);
        setData([]);
        setCopied(false);
      },
    });
  };

  const disableLoadButton = loading || !fileChanged;

  // Define a function to download the data as a CSV file
  function downloadData() {
    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, 'output.csv');
  }

  return (
    <div className='flex flex-col items-center justify-center min-h-screen text-linen bg-tropical_indigo px-4'>
      <h1 className='text-5xl lg:mb-24 mb-2 mt-5 text-center font-bold'>
        CardMarket to Moxfield CSV Converter
      </h1>
      <input
        type='file'
        accept='.csv'
        onChange={handleFileUpload}
        className='my-4 p-2 w-full max-w-md bg-french_gray text-dark_purple border border-linen rounded-md shadow-md'
      />
      <button
        onClick={handleLoadFile}
        className={`my-4 p-2 w-full max-w-xs border border-linen rounded-md shadow-md ${
          error ? 'bg-slate_blue text-linen' : 'bg-french_gray text-dark_purple'
        }`}
        disabled={disableLoadButton}>
        {error
          ? 'Error'
          : loading
          ? 'Loading'
          : fileChanged
          ? 'Load CSV File'
          : 'Data Loaded'}
      </button>

      <div
        className={`flex flex-col xl:flex-row space-y-4 xl:space-y-0 xl:space-x-4 my-4 w-full max-w-3xl xl:max-w-6xl ${
          data.length > 0 ? '' : 'xl:flex-col'
        }`}>
        <textarea
          value={
            fileContent ||
            'Please load your CardMarket CSV file. The input data will show here once loaded.'
          }
          readOnly
          className={`p-2 border border-linen bg-dark_purple rounded-md shadow-md resize-none h-[200px] lg:h-[500px] ${
            data.length > 0 ? 'xl:w-1/2' : 'xl:w-full'
          }`}
        />
        {data.length > 0 && (
          <textarea
            value={Papa.unparse(data)}
            readOnly
            className='p-2 border border-linen bg-dark_purple rounded-md shadow-md resize-none h-[200px] lg:h-[500px] xl:w-1/2'
          />
        )}
      </div>

      {loading ? (
        <div className='my-4 p-4 w-full max-w-5xl bg-french_gray border border-linen rounded-md shadow-md'>
          <p className='text-lg text-dark_purple'>
            Loading...
            <br />
            This may take a while depending on the size of your CSV file.
          </p>
        </div>
      ) : (
        <>
          {data.length > 0 && (
            <div className='w-full max-w-xs'>
              <button
                onClick={downloadData}
                className='my-4 p-2 w-full text-dark_purple bg-french_gray border border-linen rounded-md shadow-md'>
                Download Moxfield CSV
              </button>
            </div>
          )}

          {/* Display the missing IDs */}
          {missingIds.length > 0 && (
            <>
              <div className='my-4 p-4 rounded-md shadow-md bg-dark_purple border border-linen overflow-auto w-full max-w-5xl max-h-64'>
                <h2 className='text-lg font-bold mb-2 text-center'>
                  Missing CardMarket IDs
                </h2>
                {missingIds.map((item, index) => (
                  <p key={index}>
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
                  setTimeout(() => setCopied(false), 2000); // Reset the copied state after 2 seconds
                }}
                className='my-4 p-2 text-dark_purple border border-linen bg-french_gray w-full max-w-xs rounded-md shadow-md'
                disabled={copied}>
                {copied ? 'Copied!' : 'Copy Missing IDs'}
              </button>
            </>
          )}
        </>
      )}

      {/* Display the error message */}
      {error && (
        <div className='my-4 p-4 bg-slate_blue border border-linen w-full max-w-xl rounded-md shadow-md'>
          <h2 className='text-lg font-bold'>Error</h2>
          {Array.isArray(error) ? (
            error.map((errorMessage, index) => (
              <p key={index}>{errorMessage}</p>
            ))
          ) : (
            <p>{error}</p>
          )}
        </div>
      )}
      <footer className='flex-shrink-0 mt-8 text-sm text-center lg:fixed lg:m-1 lg:bottom-0 lg:right-1'>
        <p>
          Made with <span className='font-sans'>&#9749;</span> by
          <a
            href='https://github.com/Kerakis'
            target='_blank'
            rel='noopener noreferrer'>
            &nbsp;Kerakis&nbsp;
          </a>
          © {year}
        </p>
      </footer>
    </div>
  );
}

export default FetchData;
