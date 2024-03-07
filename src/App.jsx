import FetchData from './FetchData';

function App() {
  const year = new Date().getFullYear();
  return (
    <div className='App'>
      <FetchData />
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

export default App;
