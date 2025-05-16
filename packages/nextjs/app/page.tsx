"use client";

import type { NextPage } from "next";
import { CSVProcessor } from "~~/components/CSVProcessor";

const Home: NextPage = () => {
  return (
    <>
      <div className="flex items-center flex-col grow pt-10">
        <div className="w-full max-w-4xl mt-8 px-8">
          <div className="bg-base-100 p-8 rounded-3xl shadow-lg">
            <CSVProcessor />
          </div>
        </div>
      </div>
    </>
  );
};

export default Home;
